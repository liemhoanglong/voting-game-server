/* eslint-disable no-var */
import { ApolloError } from 'apollo-server-errors';

import * as _ from 'lodash';
import * as path from 'path';
import cloudinary from 'services/Cloudinary.service';
import TeamSchema from 'Team/schemas/team.schema';
import MembershipSchema from 'Membership/schemas/membership.schema';
import UserSchema from 'User/schemas/user.schema';
import {
  ITeam, ICreateMemberInput, IGameState, IGameSubscription, ICreateCard,
  IImportCard, CardIssueInput, IFile, IJiraAccess, IJiraProject, JiraAuthImport,
} from 'Team/interfaces/team.interface';
import { IUser } from 'User/interfaces/user.interface';

import { pubsub } from 'services/RedisPubsub.service';
import * as RedisService from 'services/Redis.service';
import { getSlug } from 'utils/slugify.util';
import { MailUtil } from 'utils/Mail/mail.util';

import * as ErrorMessage from 'constants/errorMessage.constant';
import * as ErrorCode from 'constants/errorCode.constant';
import { MEMBERSHIP_ROLE } from 'constants/membershipRole.constant';
import * as RedisPrefix from 'constants/redisPrefix.constant';
import { CARD_STATE } from 'constants/cardState.constant';
import * as GameCode from 'constants/gameCode.constant';
import * as CardValue from 'constants/cardValue.constant';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const dirPath = path.join(__dirname, '../images/');
const mailUtil = new MailUtil();

export class TeamService {
  private createTeamLink(team: ITeam): string {
    return `${getSlug(team.name)}-${team._id.toString()}`;
  }

  private uploadStream(createReadStream) {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream({ folder: 'images', resource_type: 'auto' }, (err, result) => {
        if (result) {
          resolve({
            url: result.url,
            id: result.public_id,
          });
        } else {
          reject(err);
        }
      });
      createReadStream().pipe(upload);
    });
  }

  private async removeImageFromCloud(publicId: string) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, { invalidate: true, resource_type: 'image' }, (err, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(err);
        }
      });
    });
  }

  private async createMembershipForMember(
    admin: IUser,
    team: ITeam,
    createMemberInput: ICreateMemberInput,
    teamLink: string,
  ): Promise<void> {
    const member: IUser = await UserSchema.findOne({ email: createMemberInput.email });

    MembershipSchema.create({
      team: team._id,
      user: member._id,
      role: createMemberInput.role,
    });

    mailUtil.sendTeamInvitationMail(admin, member, team, teamLink);
  }

  async createTeam(input: { name: string, adminEmail: string, members: [ICreateMemberInput], file: Promise<IFile> }): Promise<string> {
    const {
      name, adminEmail, members, file,
    } = input;
    const newTeamCreate: any = { name };
    const validateFile: any = await file.then((result) => result).catch((err) => 0);
    if (validateFile !== 0) {
      const { createReadStream } = validateFile;
      const urlReturn = await this.uploadStream(createReadStream);
      newTeamCreate.urlImage = urlReturn;
    }
    const team: ITeam = await TeamSchema.create(newTeamCreate);
    const admin: IUser = await UserSchema.findOne({ email: adminEmail });
    await MembershipSchema.create({
      team: team._id,
      user: admin._id,
      role: MEMBERSHIP_ROLE.ADMIN,
    });

    const teamLink = this.createTeamLink(team);

    Object.values(members).forEach((member) => {
      this.createMembershipForMember(admin, team, member, teamLink);
    });

    return teamLink;
  }

  async editTeam(input: { teamId: string, name: string, file: Promise<IFile> }): Promise<ITeam> {
    const { teamId, name, file } = input;
    const dataTeamUpdate: any = { name };
    const validateFile: any = await file.then((result) => result).catch((err) => 0);
    let imageUrlDelete: any = {};
    if (validateFile !== 0) {
      const foundTeam = await TeamSchema.findOne({ _id: teamId });
      if (foundTeam.urlImage) {
        imageUrlDelete = foundTeam.urlImage;
      }
      const { createReadStream } = validateFile;
      const urlReturn = await this.uploadStream(createReadStream);
      dataTeamUpdate.urlImage = urlReturn;
    }
    await TeamSchema.findOneAndUpdate({ _id: teamId }, dataTeamUpdate);
    if (!_.isEmpty(imageUrlDelete)) {
      this.removeImageFromCloud(imageUrlDelete.id);
    }
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    return team;
  }

  async createCardIssue(input: CardIssueInput, userId: string): Promise<ICreateCard> {
    const {
      teamId, issue, voteScore, link, description,
    } = input;
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
    if (!team || hostId !== userId) { return null; }
    const issueId = await uuidv4();
    const cardIssue = {
      _id: issueId,
      issue,
      voteScore,
      link,
      description,
      createAt: new Date(),
    };

    RedisService.hset(`${RedisPrefix.CARD_ISSUE}${teamId}`, issueId, JSON.stringify(cardIssue));
    RedisService.hsetEx(`${RedisPrefix.CARD_ISSUE}${teamId}`, 43200);

    this.publishToTeam(teamId, {
      code: GameCode.ADD_CARD,
      cardIssue,
    });

    return cardIssue;
  }

  // todo: get cloudId from jira
  // 1. send https://auth.atlassian.com/oauth/token to get token
  // 2. send https://api.atlassian.com/oauth/token/accessible-resources to get cloudId
  // 3. send jira token and jira cloudId to client
  async getCloudIdJira(code: string): Promise<IJiraAccess> {
    let tokenRes;
    let jiraApp;
    try {
      tokenRes = await axios({
        url: 'https://auth.atlassian.com/oauth/token',
        method: 'post',
        headers: {
          Accept: 'application/json',
        },
        data: {
          grant_type: 'authorization_code',
          client_id: process.env.JIRA_API_ID,
          client_secret: process.env.JIRA_API_SECRET,
          code,
          redirect_uri: process.env.CLIENT_DOMAIN,
        },
      });
      jiraApp = await axios({
        url: 'https://api.atlassian.com/oauth/token/accessible-resources',
        method: 'get',
        headers: {
          Authorization: `Bearer ${tokenRes.data.access_token}`,
          Accept: 'application/json',
        },
      });
    } catch (error) {
      console.log(error);
    }
    return {
      jiraToken: tokenRes.data.access_token,
      jiraCloudId: jiraApp.data[0].id,
      jiraUrl: jiraApp.data[0].url,
    };
  }

  // todo: get list project from jira
  async getListProjectFromJira(jiraCloudId: string, jiraToken: string): Promise<[IJiraProject]> {
    const projectListRes = await axios({
      url: `https://api.atlassian.com/ex/jira/${jiraCloudId}/rest/api/3/project`,
      method: 'get',
      headers: {
        Authorization: `Bearer ${jiraToken}`,
        Accept: 'application/json',
      },
    });
    projectListRes.data.map((project) => ({ id: project.id, name: project.name, key: project.key }));
    return projectListRes.data;
  }

  // todo: get all issues from jira link and filter by project, offset, limit
  async getListCardIssueFromJira(input: JiraAuthImport, userId: string): Promise<{ total: number, listIssue: [ICreateCard] }> {
    let allIssues: [ICreateCard] = null;
    let total: number;
    try {
      input.page = input.page && input.page > 0 ? input.page : 1;
      input.limit = input.limit && input.limit > 0 ? input.limit : 50;
      // *👇👇👇👇 jql 👇👇👇👇*
      // https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-jql/#api-rest-api-3-jql-parse-post
      // https://www.atlassian.com/blog/jira-software/jql-the-most-flexible-way-to-search-jira-14
      // agile issuetype default = task | scrum issuetype default = story | custom bug
      const jql = `status=%27to%20do%27%20and%20project%20in%20(${input.project})%20and%20issuetype%20in%20(story,task,bug)`;
      // customfield_10016 is Story point estimate in scrum jira
      const fields = 'summary,status,description,customfield_10016';
      const link = 'https://api.atlassian.com/ex/jira/';
      const startAt = --input.page * input.limit;
      const url = `${link + input.jiraCloudId}/rest/api/3/search?jql=${jql}&startAt=${startAt}&maxResults=${input.limit}&fields=${fields}`;
      // console.log(url);
      // console.log(`Bearer ${input.jiraToken}`);
      // console.log(input);
      const issues = await axios({
        url,
        method: 'get',
        headers: {
          Authorization: `Bearer ${input.jiraToken}`,
          Accept: 'application/json',
        },
      });
      total = issues.data.total;
      allIssues = issues.data.issues.map((eachIssue) => (
        {
          voteScore: eachIssue.fields.customfield_10016,
          issue: eachIssue.fields.summary,
          link: `${input.url}browse/${eachIssue.key}`,
          description: eachIssue.fields.description?.content[0]?.content[0]?.text ? eachIssue.fields.description?.content[0]?.content[0]?.text : '',
        }
      ));
    } catch (error) {
      console.log(error);
    }
    return { total, listIssue: allIssues };
  }

  // todo: import all issues selected
  async importListCardIssue(input: { teamId: string, issues: [IImportCard] }, userId: string): Promise<any> {
    const { teamId, issues } = input;
    const cardIssues = [];
    try {
      const team: ITeam = await TeamSchema.findOne({ _id: teamId });
      const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
      if (!team || hostId !== userId) { return null; }
      const issueId: string = await uuidv4();
      let eachIssue;
      const dateNow = new Date();
      for (let i = 0; i < issues.length; i++) {
        eachIssue = {
          _id: issueId + i.toString(),
          issue: issues[i].issue,
          voteScore: issues[i].voteScore ? issues[i].voteScore : -1,
          link: issues[i].link,
          description: issues[i].description,
          createAt: dateNow,
        };
        RedisService.hset(`${RedisPrefix.CARD_ISSUE}${teamId}`, eachIssue._id, JSON.stringify(eachIssue));
        cardIssues.push(eachIssue);
      }
      this.publishToTeam(teamId, {
        code: GameCode.IMPORT_CARD,
        cardIssues,
      });
      RedisService.hsetEx(`${RedisPrefix.CARD_ISSUE}${teamId}`, 43200);
    } catch (error) {
      console.log(error);
    }
    return cardIssues;
  }

  async updateCardIssue(input: CardIssueInput, userId: string): Promise<ICreateCard> {
    const { teamId } = input;
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
    if (!team || hostId !== userId) { return null; }
    const cardIssue = await RedisService.hgetAsync(`${RedisPrefix.CARD_ISSUE}${teamId}`, input._id);
    delete input.teamId;
    const newCardIssue = { ...JSON.parse(cardIssue), ...input };
    try {
      RedisService.hset(`${RedisPrefix.CARD_ISSUE}${teamId}`, input._id, JSON.stringify(newCardIssue));
    } catch (error) {
      console.log(error);
    }

    this.publishToTeam(teamId, {
      code: GameCode.UPDATE_CARD,
      cardIssue: newCardIssue,
    });

    return newCardIssue;
  }

  async selectCardIssue(input: { teamId: string, cardId: string, isSelect: boolean }, userId: string): Promise<void> {
    const { teamId, cardId, isSelect } = input;
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
    if (!team || hostId !== userId) { return; }
    if (isSelect) {
      RedisService.set(`${RedisPrefix.CURRENT_CARD}${teamId}`, cardId);
      this.publishToTeam(teamId, {
        code: GameCode.SELECT_CARD,
        cardIssue: {
          _id: cardId,
        },
      });
    } else {
      RedisService.delItem(`${RedisPrefix.CURRENT_CARD}${teamId}`);
      this.publishToTeam(teamId, {
        code: GameCode.DESELECT_CARD,
      });
    }
  }

  async removeAllCardIssue(teamId: string, userId: string): Promise<void> {
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
    if (!team || hostId !== userId) { return; }
    RedisService.delItem(`${RedisPrefix.CURRENT_CARD}${teamId}`);
    RedisService.delItem(`${RedisPrefix.CARD_ISSUE}${teamId}`);

    this.publishToTeam(teamId, {
      code: GameCode.REMOVE_ALL_CARD,
    });
  }

  async removeCardIssueById(input: { teamId: string, cardId: string }, userId: string): Promise<void> {
    const { teamId, cardId } = input;
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const hostId = await RedisService.getAsync(`${RedisPrefix.HOST_ROOM}${teamId}`);
    if (!team || hostId !== userId) { return; }
    const currentCard = await RedisService.getAsync(`${RedisPrefix.CURRENT_CARD}${teamId}`);
    if (currentCard === cardId) {
      RedisService.delItem(`${RedisPrefix.CURRENT_CARD}${teamId}`);
    }
    await RedisService.hdelItem(`${RedisPrefix.CARD_ISSUE + teamId}`, cardId);
    this.publishToTeam(teamId, {
      code: GameCode.REMOVE_CARD_BY_ID,
      cardIssue: {
        _id: cardId,
      },
    });
  }

  async getAllNewMemberInfo(members: [ICreateMemberInput]): Promise<IUser[]> {
    const allNewMemberInfo = [];

    members.forEach((member) => {
      allNewMemberInfo.push(UserSchema.findOne({ email: member.email }));
    });
    return Promise.all(allNewMemberInfo);
  }

  async inviteToTeam(input: { teamId: string, members: [ICreateMemberInput] }, adminId: string): Promise<void> {
    const { teamId, members } = input;
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    const admin: IUser = await UserSchema.findOne({ _id: adminId });

    const teamLink = this.createTeamLink(team);

    Object.values(members).forEach((member) => {
      this.createMembershipForMember(admin, team, member, teamLink);
    });

    const allNewMemberInfo = [];
    const listMemberInfo: IUser[] = await this.getAllNewMemberInfo(members);
    listMemberInfo.forEach((member) => {
      if (member) {
        allNewMemberInfo.push({
          userId: member._id,
          email: member.email,
          name: member.name,
          role: members.find((eachMember) => eachMember.email === member.email).role,
        });
      }
    });

    this.publishToTeam(teamId, {
      code: GameCode.ADD_MEMBER,
      newMember: allNewMemberInfo,
    });
  }

  async changeRole(adminId: string, input: { teamId: string, userId: string, role: number }): Promise<void> {
    // console.log('changeRole')
    const { teamId, userId, role } = input;
    const host = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    const myChannel = this.getUserChannel(teamId, userId);
    const adminTeam = await MembershipSchema.findOne({
      team: teamId,
      user: adminId,
    });
    // with admin role
    if (adminTeam.role === MEMBERSHIP_ROLE.ADMIN) {
      const userTeam = await MembershipSchema.findOne({
        team: teamId,
        user: userId,
      });
      if (role === -1 && adminId !== userId) {
        await MembershipSchema.findOneAndDelete({
          team: teamId,
          user: userId,
        });
        RedisService.hdel(`${RedisPrefix.GAME_ROOM}${teamId}`, userId);
        RedisService.hdel(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId);
        if (userId === host) {
          this.setNextHost(userId, teamId);
        }
      } else if (userTeam.role !== MEMBERSHIP_ROLE.ADMIN) {
        userTeam.role = role;
        await userTeam.save();
        const checkUserOnline = await RedisService.hgetAsync(`${RedisPrefix.GAME_ROOM}${teamId}`, userId);
        if (checkUserOnline) {
          if (role === MEMBERSHIP_ROLE.SPECTATOR) {
            RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, CardValue.SPECTATOR);
          } else {
            RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, CardValue.REDIS_NOT_PICK);
          }
        }
      }
      this.publishToTeam(teamId, {
        code: GameCode.CHANGE_ROLE,
        userAction: {
          _id: userId,
          role,
        },
      });
      pubsub.publish(myChannel, {
        subscribeToGame: {
          code: GameCode.SELF_CHANGE_ROLE,
          userAction: {
            _id: userId,
            role,
          },
        },
      });
    }
  }

  private async checkIsMemberOfTeam(userId: string, teamId: string) {
    const isInTeam = await MembershipSchema.findOne({
      team: teamId,
      user: userId,
    });

    if (!isInTeam) {
      throw new ApolloError(ErrorMessage.NOT_IN_TEAM, ErrorCode.NOT_IN_TEAM);
    }

    return isInTeam;
  }

  async getGameState(userId: string, teamId: string): Promise<IGameState> {
    const team = await TeamSchema.findOne({ _id: teamId });
    if (!team) {
      throw new ApolloError(ErrorMessage.TEAM_NOT_FOUND, ErrorCode.TEAM_NOT_FOUND);
    }

    const myMembership = await this.checkIsMemberOfTeam(userId, teamId);
    if (myMembership.role === MEMBERSHIP_ROLE.ADMIN) {
      RedisService.set(RedisPrefix.ADMIN_ROOM + teamId, userId);
    }

    const memberships = await MembershipSchema.find({ team: teamId }).populate('user').lean();

    const userStateListRedis = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);

    const currentPoint: string = await RedisService.hgetAsync(`${RedisPrefix.GAME_ROOM}${teamId}`, userId);
    const previousHost = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    const currentCard = await RedisService.getAsync(`${RedisPrefix.CURRENT_CARD}${teamId}`) || '';
    const allUserState = memberships.map((membership) => ({
      _id: membership.user._id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
      isHost: !previousHost && userId === membership.user._id.toHexString() ? true : previousHost === membership.user._id.toHexString(),
      cardState:
        (userStateListRedis && this.getCardState(userStateListRedis[membership.user._id])) || CARD_STATE.OFFLINE,
    }));
    return {
      _id: team._id,
      urlImage: team.urlImage || null,
      name: team.name,
      allUserState,
      votingSystem: team.votingSystem,
      currentPoint: currentPoint ? parseInt(currentPoint) : parseInt(CardValue.REDIS_NOT_PICK),
      role: myMembership.role,
      isHost: previousHost === userId,
      currentCard,
    };
  }

  async getAllCardIssueByTeamId(teamId: string): Promise<ICreateCard[]> {
    const team: ITeam = await TeamSchema.findOne({ _id: teamId });
    if (!team) return null;
    let cardListRedis = await RedisService.hvalsAsync(`${RedisPrefix.CARD_ISSUE}${teamId}`);

    cardListRedis = cardListRedis.map((cardIssue) => JSON.parse(cardIssue));

    cardListRedis.sort((a, b) => new Date(a.createAt).getTime() - new Date(b.createAt).getTime());
    return cardListRedis;
  }

  private getCardState(cardValue): number {
    if (typeof cardValue !== 'string') {
      return CARD_STATE.OFFLINE;
    }
    if (cardValue === CardValue.REDIS_NOT_PICK || cardValue === CardValue.SPECTATOR) {
      return CARD_STATE.NOT_PICK;
    }
    return CARD_STATE.PICKED;
  }

  async setUserConnection(teamId: string, userId: string): Promise<CARD_STATE> {
    // console.log('setUserConnection')
    const isExistUser = await RedisService.hgetAsync(`${RedisPrefix.GAME_ROOM}${teamId}`, userId);
    const myMembership = await this.checkIsMemberOfTeam(userId, teamId);
    if (isExistUser) {
      const numberConnection: string = await RedisService.hgetAsync(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId);
      RedisService.hset(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId, parseInt(numberConnection) + 1);
      if (myMembership.role !== MEMBERSHIP_ROLE.SPECTATOR) return CARD_STATE.NOT_PICK;
      return this.getCardState(isExistUser);
    }
    if (myMembership.role === MEMBERSHIP_ROLE.SPECTATOR) {
      RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, CardValue.SPECTATOR);
    } else {
      RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, CardValue.REDIS_NOT_PICK);
    }
    RedisService.hset(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId, 1);

    return CARD_STATE.NOT_PICK;
  }

  async changeHost(input: { userId: string, teamId: string }, adminId: string): Promise<void> {
    const { teamId, userId } = input;
    const host = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    const hostChannel = this.getUserChannel(teamId, adminId);
    // with host role
    if (adminId === host) {
      RedisService.delItem(RedisPrefix.HOST_ROOM + teamId);
      this.setHost(userId, teamId);
      pubsub.publish(hostChannel, {
        subscribeToGame: {
          code: GameCode.INACTIVE_HOST,
          userAction: {
            _id: adminId,
          },
        },
      });
      this.publishToTeam(teamId, {
        code: GameCode.CHANGE_HOST_TEAM,
        userAction: {
          _id: userId,
        },
      });
    }
  }

  async changeHostWhenJiraCallback(input: { userId: string, teamId: string }): Promise<void> {
    try {
      const { teamId, userId } = input;
      const host = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
      const hostChannel = this.getUserChannel(teamId, host);
      pubsub.publish(hostChannel, {
        subscribeToGame: {
          code: GameCode.INACTIVE_HOST,
          userAction: {
            _id: host,
          },
        },
      });
      RedisService.set(RedisPrefix.HOST_ROOM + teamId, userId);
      const myChannel = this.getUserChannel(teamId, userId);
      pubsub.publish(myChannel, {
        subscribeToGame: {
          code: GameCode.IS_HOST,
          userAction: {
            _id: userId,
          },
        },
      });
      this.publishToTeam(teamId, {
        code: GameCode.CHANGE_HOST_TEAM,
        userAction: {
          _id: userId,
        },
      });
    } catch (error) {
      console.log(error);
    }
  }

  async setNextHost(userId: string, teamId: string) {
    const previousHost = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    if (previousHost === userId) {
      RedisService.delItem(RedisPrefix.HOST_ROOM + teamId);
      const cardValuesRedis = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);
      let userIds = [];
      if (cardValuesRedis) {
        userIds = Object.getOwnPropertyNames(cardValuesRedis);
      }

      let admin = await RedisService.getAsync(RedisPrefix.ADMIN_ROOM + teamId);
      if (userId === admin) {
        RedisService.delItem(RedisPrefix.ADMIN_ROOM + teamId);
        admin = null;
      }

      if (userIds.length !== 0 && (admin === previousHost || !userIds.includes(admin))) {
        RedisService.set(RedisPrefix.HOST_ROOM + teamId, userIds[0]);
        const myChannel = this.getUserChannel(teamId, userIds[0]);
        pubsub.publish(myChannel, {
          subscribeToGame: {
            code: GameCode.IS_HOST,
            userAction: {
              _id: userIds[0],
            },
          },
        });
        this.publishToTeam(teamId, {
          code: GameCode.CHANGE_HOST_TEAM,
          userAction: {
            _id: userIds[0],
          },
        });
      } else if (admin) {
        RedisService.set(RedisPrefix.HOST_ROOM + teamId, admin);
        const myChannel = this.getUserChannel(teamId, admin);
        pubsub.publish(myChannel, {
          subscribeToGame: {
            code: GameCode.IS_HOST,
            userAction: {
              _id: admin,
            },
          },
        });
        this.publishToTeam(teamId, {
          code: GameCode.CHANGE_HOST_TEAM,
          userAction: {
            _id: admin,
          },
        });
      }
    }
  }

  async setUserDisconnect(teamId: string, userId: string) {
    // console.log('setUserDisconnect')
    const numberConnection: string = await RedisService.hgetAsync(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId);
    if (numberConnection === '1') {
      RedisService.hdel(`${RedisPrefix.GAME_ROOM}${teamId}`, userId);
      RedisService.hdel(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId);
      const checkUserOnline = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);
      if (!checkUserOnline) {
        RedisService.delItem(`${RedisPrefix.CURRENT_CARD}${teamId}`);
        RedisService.delItem(RedisPrefix.IS_START_COUNTDOWN + teamId);
      }
      this.setNextHost(userId, teamId);

      // publish disconnect
      this.publishToTeam(teamId, {
        code: GameCode.USER_CHANGE_STATE,
        userAction: {
          _id: userId,
          cardState: CARD_STATE.OFFLINE,
        },
      });
    } else if (numberConnection) {
      RedisService.hset(`${RedisPrefix.USER_CONNECTION}${teamId}`, userId, parseInt(numberConnection) - 1);
    }
  }

  private getUserChannel(teamId: string, userId: string): string {
    return `${teamId}_${userId}`;
  }

  private async publishToTeam(teamId: string, payload: IGameSubscription) {
    const userIds = await RedisService.hkeysAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);
    userIds.forEach((userId) => {
      const userChannel = this.getUserChannel(teamId, userId);
      pubsub.publish(userChannel, {
        subscribeToGame: payload,
      });
    });
  }

  subscribeToGame(userId: string, teamId: string) {
    const myChannel = this.getUserChannel(teamId, userId);

    const resultIterator = pubsub.asyncIterator(myChannel);
    const asyncReturn = resultIterator.return.bind(resultIterator);

    resultIterator.return = () => {
      this.setUserDisconnect(teamId, userId);
      return asyncReturn ? asyncReturn.call(resultIterator) : Promise.resolve({ value: undefined, done: true });
    };
    this.joinToGame(userId, teamId);
    return resultIterator;
  }

  pickCard(input: { teamId: string, point: number }, userId: string): void {
    const { teamId, point } = input;
    const myChannel = this.getUserChannel(teamId, userId);
    RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, point);

    pubsub.publish(myChannel, {
      subscribeToGame: {
        code: GameCode.USER_CURRENT_POINT,
        currentPoint: point,
      },
    });

    this.publishToTeam(teamId, {
      code: GameCode.USER_CHANGE_STATE,
      userAction: {
        _id: userId,
        cardState: point === parseInt(CardValue.REDIS_NOT_PICK) ? CARD_STATE.NOT_PICK : CARD_STATE.PICKED,
      },
    });

    // return true;
  }

  pickCardAndShow(input: { teamId: string, point: number }, userId: string): void {
    const { teamId, point } = input;
    const myChannel = this.getUserChannel(teamId, userId);
    RedisService.hset(`${RedisPrefix.GAME_ROOM}${teamId}`, userId, point);

    pubsub.publish(myChannel, {
      subscribeToGame: {
        code: GameCode.USER_CURRENT_POINT,
        currentPoint: point,
      },
    });

    this.publishToTeam(teamId, {
      code: GameCode.USER_CHANGE_STATE,
      userAction: {
        _id: userId,
        cardState: point === parseInt(CardValue.REDIS_NOT_PICK) ? CARD_STATE.NOT_PICK : CARD_STATE.PICKED,
      },
    });

    this.CheckAllUserShow(teamId);
  }

  async CheckAllUserShow(teamId: string): Promise<boolean> {
    const cardValuesRedis = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);
    const userIds = Object.getOwnPropertyNames(cardValuesRedis);

    let checkAll = true;
    let countSpectator = 0;

    userIds.forEach((user) => {
      if (String(cardValuesRedis[user]) === CardValue.REDIS_NOT_PICK) {
        checkAll = false;
      }
      if (String(cardValuesRedis[user]) === CardValue.SPECTATOR) {
        countSpectator += 1;
      }
    });

    if (countSpectator === userIds.length) checkAll = false;

    if (checkAll) {
      RedisService.delItem(RedisPrefix.IS_START_COUNTDOWN + teamId);
      const currentCard = await RedisService.getAsync(`${RedisPrefix.CURRENT_CARD}${teamId}`);
      const cardValues = userIds.map((id) => ({
        _id: id,
        point: cardValuesRedis[id],
      }));

      if (currentCard) {
        const cardIssue = await RedisService.hgetAsync(`${RedisPrefix.CARD_ISSUE}${teamId}`, currentCard);
        if (this.checkEqualPoint(cardValuesRedis, userIds)) {
          const voteScore = cardValuesRedis[userIds.find((element) => (cardValuesRedis[element] !== CardValue.SPECTATOR))];
          const newCardIssue = { ...JSON.parse(cardIssue), voteScore };

          RedisService.hset(`${RedisPrefix.CARD_ISSUE}${teamId}`, currentCard, JSON.stringify(newCardIssue));
          this.publishToTeam(teamId, {
            code: GameCode.SHOW_CARDS_EQUAL,
            cardValues,
            cardIssue: {
              _id: currentCard,
            },
          });
        } else {
          this.publishToTeam(teamId, {
            code: GameCode.SHOW_CARDS_NOT_EQUAL,
            cardValues,
            cardIssue: {
              _id: currentCard,
            },
          });
        }
      } else {
        this.publishToTeam(teamId, {
          code: GameCode.SHOW_CARDS,
          cardValues,
        });
      }
    }

    return checkAll;
  }

  checkEqualPoint(pointObject, userIdList): boolean {
    let check = true;
    const currentPoint = pointObject[userIdList.find((element) => (pointObject[element] !== CardValue.SPECTATOR))];
    // const currentPoint = pointObject[userIdList[0]];
    userIdList.forEach((id) => {
      if (pointObject[id] !== currentPoint && pointObject[id] !== CardValue.SPECTATOR) { check = false; }
    });
    return check;
  }

  async showCards(userId: string, teamId: string): Promise<void> {
    // await this.checkIsMemberOfTeam(userId, teamId);
    const cardValuesRedis = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM}${teamId}`);
    const userIds = Object.getOwnPropertyNames(cardValuesRedis);
    RedisService.delItem(RedisPrefix.IS_START_COUNTDOWN + teamId);
    const currentCard = await RedisService.getAsync(`${RedisPrefix.CURRENT_CARD}${teamId}`);

    this.publishToTeam(teamId, {
      code: GameCode.START_TIMER,
      timer: {
        timer: 0,
      },
    });

    const cardValues = userIds.map((id) => ({
      _id: id,
      point: cardValuesRedis[id],
    }));

    if (currentCard) {
      const cardIssue = await RedisService.hgetAsync(`${RedisPrefix.CARD_ISSUE}${teamId}`, currentCard);
      if (this.checkEqualPoint(cardValuesRedis, userIds)) {
        const voteScore = cardValuesRedis[userIds.find((element) => (cardValuesRedis[element] !== CardValue.SPECTATOR))];
        const newCardIssue = { ...JSON.parse(cardIssue), voteScore };
        RedisService.hset(`${RedisPrefix.CARD_ISSUE}${teamId}`, currentCard, JSON.stringify(newCardIssue));
        this.publishToTeam(teamId, {
          code: GameCode.SHOW_CARDS_EQUAL,
          cardValues,
          cardIssue: {
            _id: currentCard,
          },
        });
      } else {
        this.publishToTeam(teamId, {
          code: GameCode.SHOW_CARDS_NOT_EQUAL,
          cardValues,
          cardIssue: {
            _id: currentCard,
          },
        });
      }
    } else {
      this.publishToTeam(teamId, {
        code: GameCode.SHOW_CARDS,
        cardValues,
      });
    }
  }

  async restartGame(userId: string, teamId: string): Promise<void> {
    // await this.checkIsMemberOfTeam(userId, teamId);
    try {
      const resetRoomValue = await RedisService.hgetallAsync(`${RedisPrefix.GAME_ROOM + teamId}`);
      const key = Object.keys(resetRoomValue);
      for (let i = 0; i < key.length; i++) {
        resetRoomValue[key[i]] = resetRoomValue[key[i]] === CardValue.SPECTATOR ? CardValue.SPECTATOR : CardValue.REDIS_NOT_PICK;
        RedisService.hset(`${RedisPrefix.GAME_ROOM + teamId}`, key[i], resetRoomValue[key[i]]);
      }
      this.publishToTeam(teamId, {
        code: GameCode.RESTART_GAME,
      });
    } catch (error) {
      console.log(error);
    }
  }

  async pingUser(userId: string, teamId: string, adminId): Promise<void> {
    const host = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    if (adminId !== userId && adminId === host) {
      const userChannel = this.getUserChannel(teamId, userId);
      pubsub.publish(userChannel, {
        subscribeToGame: {
          code: GameCode.PING,
        },
      });
    }
  }

  startTimer(userId: string, input: { teamId: string, timer: number }): void {
    // await this.checkIsMemberOfTeam(userId, teamId);
    const { teamId, timer } = input;
    if (timer !== 0) {
      RedisService.setEx(RedisPrefix.TIMER_ROOM + teamId, timer, timer);
      RedisService.set(RedisPrefix.IS_START_COUNTDOWN + teamId, 'ok');
    } else {
      RedisService.delItem(RedisPrefix.IS_START_COUNTDOWN + teamId);
    }

    this.publishToTeam(teamId, {
      code: GameCode.START_TIMER,
      timer: {
        timer,
      },
    });
  }

  async setHost(userId: string, teamId: string): Promise<void> {
    // await this.checkIsMemberOfTeam(userId, teamId);
    // console.log('set host')
    const previousHostCheck = await RedisService.getAsync(RedisPrefix.HOST_ROOM + teamId);
    const myChannel = this.getUserChannel(teamId, userId);
    // console.log(previousHostCheck)
    if (previousHostCheck) {
      return;
    }
    RedisService.set(RedisPrefix.HOST_ROOM + teamId, userId);
    pubsub.publish(myChannel, {
      subscribeToGame: {
        code: GameCode.IS_HOST,
        userAction: {
          _id: userId,
        },
      },
    });
  }

  async joinToGame(userId: string, teamId: string): Promise<void> {
    const currentUserCardState: number = await this.setUserConnection(teamId, userId);

    this.publishToTeam(teamId, {
      code: GameCode.USER_CHANGE_STATE,
      userAction: {
        _id: userId,
        cardState: currentUserCardState,
      },
    });

    this.setHost(userId, teamId);

    const myChannel = this.getUserChannel(teamId, userId);

    const isCountDown = await RedisService.getAsync(RedisPrefix.IS_START_COUNTDOWN + teamId);

    let timeLeft = 0;
    if (isCountDown) {
      const totalTime = await RedisService.getAsync(RedisPrefix.TIMER_ROOM + teamId) || 0;
      const tempTime = await RedisService.ttlAsync(RedisPrefix.TIMER_ROOM + teamId);
      timeLeft = tempTime < 0 ? 0 : tempTime;
      pubsub.publish(myChannel, {
        subscribeToGame: {
          code: GameCode.TIMER_LEFT,
          timer: {
            timer: totalTime,
            timerLeft: timeLeft,
          },
        },
      });
    }
  }

  private objectify(array) {
    return array.reduce((p, c) => {
      // eslint-disable-next-line prefer-destructuring
      p[c[0]] = c[1];
      return p;
    }, {});
  }
}
