import { ApolloError } from 'apollo-server-errors';
import * as jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import bcrypt = require('bcrypt');

import UserSchema from 'User/schemas/user.schema';
import MembershipSchema from 'Membership/schemas/membership.schema';
import { MailUtil } from 'utils/Mail/mail.util';

import {
  IUser, ILoginSuccess, IUserPublicInfo, ITeamInfo,
} from 'User/interfaces/user.interface';

import * as RedisService from 'services/Redis.service';
import { getSlug } from 'utils/slugify.util';

import * as ErrorMessage from '../constants/errorMessage.constant';
import { AUTH_TYPE } from '../constants/userAuthType.constant';
import * as JwtExpireTime from '../constants/jwtExpireTime.constant';
import { MEMBERSHIP_ROLE } from '../constants/membershipRole.constant';
import * as ErrorCode from '../constants/errorCode.constant';
import * as RedisExpireTime from '../constants/redisExpireTime.constant';
import * as RedisPrefix from '../constants/redisPrefix.constant';
import * as Attempt from '../constants/attempt.constant';

const mailUtil = new MailUtil();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
export class UserService {
  private createTeamLink(teamId: string, teamName: string): string {
    return `${getSlug(teamName)}-${teamId.toString()}`;
  }

  async signUp(input: { name: string, email: string, password: string }): Promise<boolean> {
    const { email, name, password } = input;
    const user: IUser = await UserSchema.findOne({ email });

    if (user) {
      throw new ApolloError(
        ErrorMessage.EMAIL_ALREADY_EXIST,
        ErrorCode.EMAIL_ALREADY_EXIST,
      );
    }

    const newUser: IUser = await UserSchema.create({
      name,
      email,
      password: await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUND)),
    });

    const token: string = this.getVerificationEmailToken(newUser._id);
    RedisService.setEx(RedisPrefix.VERIFY_EMAIL_TOKEN + email, RedisExpireTime.VERIFY_EMAIL_TOKEN, token);
    mailUtil.sendVerificationMail(newUser, token);
    return true;
  }

  getAdminRoom(team: string, listMember: any): string {
    const x: string = listMember.find((element) => element.team._id.toHexString() === team).user._id.toHexString();
    return x;
  }

  async getTeamList(userId: string): Promise<ITeamInfo[]> {
    const memberships = await MembershipSchema.find({ user: userId }).populate('team').lean();
    const membershipAdmin = await MembershipSchema.find({ role: MEMBERSHIP_ROLE.ADMIN }).populate('team').lean();
    const teamList = memberships.map((membership) => ({
      adminId: this.getAdminRoom(membership.team._id.toHexString(), membershipAdmin),
      teamId: membership.team._id,
      name: membership.team.name,
      teamLink: this.createTeamLink(membership.team._id, membership.team.name),
      urlImage: membership.team.urlImage || null,
    }));
    return teamList;
  }

  async activate(token: string): Promise<boolean> {
    const decoded = jwt.verify(token, process.env.JWT_ACTIVATE_USER);
    const { userId } = decoded;
    const user: IUser = await UserSchema.findOne({ _id: userId });

    if (!user) { throw new ApolloError(ErrorMessage.INTERNAL); }

    const serverValue = await RedisService.getAsync(RedisPrefix.VERIFY_EMAIL_TOKEN + user.email);
    if (serverValue !== token) {
      throw new ApolloError(
        ErrorMessage.TOKEN_EXPIRED,
        ErrorCode.TOKEN_EXPIRED,
      );
    }

    if (user.isVerified) {
      throw new ApolloError(
        ErrorMessage.EMAIL_VERIFIED,
        ErrorCode.EMAIL_VERIFIED,
      );
    }
    await UserSchema.findOneAndUpdate({ _id: userId }, { isVerified: true });
    RedisService.delItem(RedisPrefix.VERIFY_EMAIL_TOKEN + user.email);

    return true;
  }

  async checkResetPasswordToken(token: string): Promise<boolean> {
    const decoded = jwt.verify(token, process.env.JWT_RESET_PASSWORD);
    const { userId } = decoded;
    const user: IUser = await UserSchema.findOne({ _id: userId });

    if (!user) { throw new ApolloError(ErrorMessage.INTERNAL); }
    const serverValue = await RedisService.getAsync(RedisPrefix.RESET_PASSWORD_TOKEN + user.email);
    if (serverValue !== token) {
      throw new ApolloError(
        ErrorMessage.TOKEN_EXPIRED,
        ErrorCode.TOKEN_EXPIRED,
      );
    }
    return true;
  }

  async login(email: string, password: string): Promise<ILoginSuccess> {
    const countLog = await RedisService.getAsync(RedisPrefix.SIGN_IN_ATTEMPT + email);

    if (parseInt(countLog) === Attempt.LOGIN_LEFT) {
      const secondLeft = await RedisService.ttlAsync(RedisPrefix.SIGN_IN_ATTEMPT + email);
      const minuteLeft = Math.ceil(parseInt(secondLeft) / 60);

      throw new ApolloError(
        ErrorMessage.BLOCK_LOGIN(minuteLeft),
        ErrorCode.BLOCK_LOGIN,
        { errorResponse: { minuteLeft } },
      );
    }

    const user: IUser = await UserSchema.findOne({ email });

    if (!user) {
      throw new ApolloError(
        ErrorMessage.INCORRECT_EMAIL,
        ErrorCode.INCORRECT_EMAIL,
      );
    }

    if (user.authType !== AUTH_TYPE.EMAIL) {
      throw new ApolloError(
        ErrorMessage.WRONG_AUTH_TYPE,
        ErrorCode.WRONG_AUTH_TYPE,
      );
    }

    if (!user.isVerified) {
      throw new ApolloError(
        ErrorMessage.UNVERIFIED_USER,
        ErrorCode.UNVERIFIED_USER,
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      const timesLeft = await this.setAttemptLeftRedis(
        RedisPrefix.SIGN_IN_ATTEMPT + email,
        Attempt.LOGIN_LEFT,
        RedisExpireTime.SIGN_IN_ATTEMPT,
      );

      throw new ApolloError(
        ErrorMessage.INCORRECT_PASSWORD(timesLeft),
        ErrorCode.INCORRECT_PASSWORD,
        { errorResponse: { timesLeft } },
      );
    }

    const token = this.getAccessToken(user._id);

    return {
      token, name: user.name, email: user.email,
    };
  }

  async resendVerificationEmail(email: string): Promise<boolean> {
    await this.checkAttemptLeftRedis(
      RedisPrefix.RESEND_VERIFICATION_ATTEMPT + email,
      Attempt.RESEND_VERIFICATION_EMAIL_LEFT,
      new ApolloError(
        ErrorMessage.BLOCK_RESEND_VERIFICATION,
        ErrorCode.BLOCK_RESEND_VERIFICATION,
      ),
    );

    const user: IUser = await UserSchema.findOne({ email });
    if (!user) {
      throw new ApolloError(
        ErrorMessage.UNREGISTERED,
        ErrorCode.UNREGISTERED,
      );
    }
    const token: string = this.getVerificationEmailToken(user._id);
    RedisService.setEx(RedisPrefix.VERIFY_EMAIL_TOKEN + email, RedisExpireTime.VERIFY_EMAIL_TOKEN, token);
    mailUtil.sendVerificationMail(user, token);

    await this.setAttemptLeftRedis(
      RedisPrefix.RESEND_VERIFICATION_ATTEMPT + email,
      Attempt.RESEND_VERIFICATION_EMAIL_LEFT,
      RedisExpireTime.RESEND_VERIFICATION_ATTEMPT,
    );

    return true;
  }

  async sendResetPasswordEmail(email: string): Promise<boolean> {
    await this.checkAttemptLeftRedis(RedisPrefix.RESET_PASSWORD_ATTEMPT + email,
      Attempt.RESEND_RESET_PASSWORD_EMAIL_LEFT,
      new ApolloError(
        ErrorMessage.BLOCK_RESET_PASSWORD,
        ErrorCode.BLOCK_RESET_PASSWORD,
      ));

    const user: IUser = await UserSchema.findOne({ email });

    if (!user || !user.isVerified) {
      throw new ApolloError(
        ErrorMessage.UNREGISTERED,
        ErrorCode.UNREGISTERED,
      );
    }

    if (user.authType !== AUTH_TYPE.EMAIL) {
      throw new ApolloError(
        ErrorMessage.RESET_PASSWORD_FOR_THIRD_PARTY,
        ErrorCode.RESET_PASSWORD_FOR_THIRD_PARTY,
      );
    }

    const token: string = this.getResetPasswordToken(user._id);
    RedisService.setEx(
      RedisPrefix.RESET_PASSWORD_TOKEN + email,
      RedisExpireTime.RESET_PASSWORD_TOKEN,
      token,
    );

    mailUtil.sendResetPasswordMail(user, token);

    await this.setAttemptLeftRedis(
      RedisPrefix.RESET_PASSWORD_ATTEMPT + email,
      Attempt.RESEND_RESET_PASSWORD_EMAIL_LEFT,
      RedisExpireTime.RESET_PASSWORD_ATTEMPT,
    );

    return true;
  }

  async resetPassword(token: string, password: string): Promise<boolean> {
    const decoded = jwt.verify(token, process.env.JWT_RESET_PASSWORD);
    const { userId } = decoded;
    const user: IUser = await UserSchema.findOne({ _id: userId });

    if (!user) {
      throw new ApolloError(
        ErrorMessage.UNREGISTERED,
        ErrorCode.UNREGISTERED,
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (isValidPassword) {
      throw new ApolloError(
        ErrorMessage.EXIST_PASSWORD,
        ErrorCode.EXIST_PASSWORD,
      );
    }

    const newPassword: string = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUND));
    await UserSchema.findOneAndUpdate({ _id: userId }, { password: newPassword });
    RedisService.delItem(RedisPrefix.RESET_PASSWORD_TOKEN + user.email);

    return true;
  }

  private async checkAttemptLeftRedis(key: string, value: number, error: ApolloError) {
    const serverValue = await RedisService.getAsync(key);

    if (parseInt(serverValue) === value) {
      throw error;
    }
  }

  private async setAttemptLeftRedis(key: string, atMostValue: number, expiredTime: number): Promise<number> {
    let serverValue = await RedisService.getAsync(key);
    serverValue = serverValue || 0;
    let remainTime = await RedisService.ttlAsync(key);
    remainTime = parseInt(remainTime) > 0 ? parseInt(remainTime) : expiredTime;
    RedisService.setEx(key, remainTime, parseInt(serverValue) + 1);

    return atMostValue - parseInt(serverValue);
  }

  private getVerificationEmailToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env.JWT_ACTIVATE_USER,
      { expiresIn: JwtExpireTime.VERIFICATION_EMAIL },
    );
  }

  private getResetPasswordToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env.JWT_RESET_PASSWORD,
      { expiresIn: JwtExpireTime.RESET_PASSWORD_EMAIL },
    );
  }

  private getAccessToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env.JWT_ACCESS_TOKEN,
      { expiresIn: JwtExpireTime.ACCESS_TOKEN },
    );
  }

  private async findOrCreateUser(email: string, name: string, thirdParty: AUTH_TYPE): Promise<IUser> {
    let user: IUser = await UserSchema.findOne({ email });

    if (!user) {
      user = await UserSchema.create({
        name,
        email,
        isVerified: true,
        authType: thirdParty,
      });
    }

    if (user.authType !== thirdParty) {
      throw new ApolloError(
        ErrorMessage.EMAIL_ALREADY_EXIST,
        ErrorCode.EMAIL_ALREADY_EXIST,
      );
    }

    return user;
  }

  async loginWithGoogle(googleToken: string): Promise<ILoginSuccess> {
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const user: IUser = await this.findOrCreateUser(payload.email, payload.name, AUTH_TYPE.GOOGLE);
    const token: string = this.getAccessToken(user._id);

    return {
      token,
      name: user.name,
      email: user.email,
    };
  }

  async loginWithFacebook(userId: string, facebookToken: string): Promise<ILoginSuccess> {
    const url = `https://graph.facebook.com/v11.0/${userId}?fields=name,email,picture&access_token=${facebookToken}`;

    const response = await axios.get(url);
    const { email, name } = response.data;
    const user: IUser = await this.findOrCreateUser(email, name, AUTH_TYPE.FACEBOOK);
    const token: string = this.getAccessToken(user._id);
    if (!email) {
      throw new ApolloError(
        ErrorMessage.INTERNAL,
        ErrorCode.INTERNAL,
      );
    }

    return {
      token,
      name: user.name,
      email: user.email,
    };
  }

  async searchUserByEmail(email: string): Promise<IUserPublicInfo> {
    const user: IUser = await UserSchema.findOne({ email });
    if (user) {
      return {
        userId: user._id,
        email: user.email,
        name: user.name,
      };
    }

    return null;
  }

  async searchUserListByEmail(email: string): Promise<IUserPublicInfo[]> {
    const emailRegex = new RegExp(email.replace(/[-[\]{}()*+?,\\^$|#\s]/g, '\\$&'), 'gi');
    const users: IUser[] = await UserSchema.find({ email: emailRegex });
    if (users.length) {
      const userList = users.map((user) => ({
        userId: user._id,
        email: user.email,
        name: user.name,
      }));
      return userList;
    }

    return null;
  }
}
