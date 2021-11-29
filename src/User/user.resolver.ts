import { UserService } from 'User/user.service';
import { ILoginSuccess, IUserPublicInfo, ITeamInfo } from 'User/interfaces/user.interface';

const userService = new UserService();

const userResolver = {
  Query: {
    resendVerificationEmail: async (
      _,
      { input }: { input: { email: string } },
    ): Promise<boolean> => userService.resendVerificationEmail(input.email),

    sendResetPasswordEmail: async (
      _,
      { input }: { input: { email: string } },
    ): Promise<boolean> => userService.sendResetPasswordEmail(input.email),

    searchUserByEmail: async (
      _,
      { input }: { input: { email: string } },
    ): Promise<IUserPublicInfo> => userService.searchUserByEmail(input.email),

    searchUserListByEmail: async (
      _,
      { input }: { input: { email: string } },
    ): Promise<IUserPublicInfo[]> => userService.searchUserListByEmail(input.email),

    getTeamList: async (
      _,
      args,
      context,
    ): Promise<ITeamInfo[]> => {
      const { userId } = context.req;
      return userService.getTeamList(userId);
    },

    checkToken: (
      _,
    ): boolean => true,
  },

  Mutation: {
    signUp: async (
      _,
      { input }: { input: { email: string; name: string, password: string } },
    ): Promise<boolean> => userService.signUp(input),

    activate: (
      _,
      { token }: { token: string },
    ): Promise<boolean> => userService.activate(token),

    checkResetPasswordToken: (
      _,
      { token }: { token: string },
    ): Promise<boolean> => userService.checkResetPasswordToken(token),

    login: async (_,
      { input }: { input: { email: string; password: string } }): Promise<ILoginSuccess> => {
      const { email, password } = input;
      return userService.login(email, password);
    },

    loginWithGoogle: async (
      _,
      { googleToken }: { googleToken: string },
    ): Promise<ILoginSuccess> => userService.loginWithGoogle(googleToken),

    loginWithFacebook: async (
      _,
      { input }: { input: { userId: string, facebookToken: string } },
    ): Promise<ILoginSuccess> => {
      const { userId, facebookToken } = input;
      return userService.loginWithFacebook(userId, facebookToken);
    },

    resetPassword: async (
      _,
      { input }: { input: { token: string; password: string } },
    ): Promise<boolean> => {
      const { token, password } = input;
      return userService.resetPassword(token, password);
    },
  },
};

export default userResolver;
