import { TeamService } from 'Team/team.service';
import {
  ICreateMemberInput, IGameState, ICreateCard, IImportCard, CardIssueInput,
  ITeam, IJiraAccess, IJiraProject, JiraAuthImport,
} from 'Team/interfaces/team.interface';
import * as graphqlUpload from 'graphql-upload';

const teamService = new TeamService();

const userResolver = {
  Upload: graphqlUpload.GraphQLUpload,
  Query: {
    getGameState: async (_, { teamId }: { teamId: string }, context): Promise<IGameState> => {
      const { userId } = context.req;
      return teamService.getGameState(userId, teamId);
    },

    getAllCardIssueByTeamId: async (_, { teamId }: { teamId: string }): Promise<ICreateCard[]> => teamService.getAllCardIssueByTeamId(teamId),

    getListCardIssueFromJira: async (
      _,
      { input }: { input: JiraAuthImport },
      context,
    ): Promise<{ total: number, listIssue: [ICreateCard] }> => {
      const { userId } = context.req;
      return teamService.getListCardIssueFromJira(input, userId);
    },

    getCloudIdJira: async (_, { code }: { code: string }): Promise<IJiraAccess> => teamService.getCloudIdJira(code),

    getListProjectFromJira: async (_, { input }: { input: { jiraCloudId: string, jiraToken: string } }): Promise<[IJiraProject]> => (
      teamService.getListProjectFromJira(input.jiraCloudId, input.jiraToken)
    ),
  },

  Subscription: {
    subscribeToGame: {
      subscribe: (_, { teamId }: { teamId: string }, context) => {
        const { userId } = context;
        return teamService.subscribeToGame(userId, teamId);
      },
    },
  },

  Mutation: {
    createTeam: async (
      _,
      { input }: { input: { name: string; adminEmail: string, members: [ICreateMemberInput], file: any } },
    ): Promise<string> => teamService.createTeam(input),

    editTeam: async (
      _,
      { input }: { input: { teamId: string, name: string, file } },
      context,
    ): Promise<ITeam> => teamService.editTeam(input),

    importListCardIssue: async (
      _,
      { input }: { input: { teamId: string, issues: [IImportCard] } },
      context,
    ): Promise<any> => {
      const { userId } = context.req;
      return teamService.importListCardIssue(input, userId);
    },

    createCardIssue: async (
      _,
      { input }: { input: CardIssueInput },
      context,
    ): Promise<ICreateCard> => {
      const { userId } = context.req;
      return teamService.createCardIssue(input, userId);
    },

    updateCardIssue: async (
      _,
      { input }: { input: CardIssueInput },
      context,
    ): Promise<ICreateCard> => {
      const { userId } = context.req;
      return teamService.updateCardIssue(input, userId);
    },

    selectCardIssue: async (
      _,
      { input }: { input: { teamId: string, cardId: string, isSelect: boolean } },
      context,
      // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.selectCardIssue(input, userId);
    },

    removeAllCardIssue: async (_, { teamId }: { teamId: string }, context): Promise<void> => {
      const { userId } = context.req;
      return teamService.removeAllCardIssue(teamId, userId);
    },

    removeCardIssueById: async (
      _,
      { input }: { input: { teamId: string, cardId: string } },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.removeCardIssueById(input, userId);
    },

    pickCard: (
      _,
      { input }: { input: { teamId: string, point: number } },
      context,
    ): void => {
      const { userId } = context.req;
      return teamService.pickCard(input, userId);
    },

    pickCardAndShow: (
      _,
      { input }: { input: { teamId: string, point: number } },
      context,
    ): void => {
      const { userId } = context.req;
      return teamService.pickCardAndShow(input, userId);
    },

    showCards: async (
      _,
      { teamId }: { teamId: string },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.showCards(userId, teamId);
    },

    restartGame: async (
      _,
      { teamId }: { teamId: string },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.restartGame(userId, teamId);
    },

    startTimer: async (
      _,
      { input }: { input: { teamId: string, timer: number } },
      context,
      // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.startTimer(userId, input);
    },

    pingUser: async (
      _,
      { input }: { input: { teamId: string, userId: string } },
      context,
      // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<void> => {
      const adminId = context.req.userId;
      const { teamId, userId } = input;
      return teamService.pingUser(userId, teamId, adminId);
    },

    changeHost: async (
      _,
      { input }: { input: { teamId: string, userId: string } },
      context,
      // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<void> => {
      const adminId = context.req.userId;
      return teamService.changeHost(input, adminId);
    },

    changeHostWhenJiraCallback: (
      _,
      { input }: { input: { teamId: string, userId: string } },
      context,
      // eslint-disable-next-line @typescript-eslint/require-await
    ): Promise<void> => (teamService.changeHostWhenJiraCallback(input)),

    setHost: async (
      _,
      { teamId }: { teamId: string },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.setHost(userId, teamId);
    },

    joinToGame: async (
      _,
      { teamId }: { teamId: string },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.joinToGame(userId, teamId);
    },

    inviteToTeam: (
      _,
      { input }: { input: { teamId: string, members: [ICreateMemberInput] } },
      context,
    ): Promise<void> => {
      const { userId } = context.req;
      return teamService.inviteToTeam(input, userId);
    },

    changeRole: (
      _,
      { input }: { input: { teamId: string, userId: string, role: number } },
      context,
    ): Promise<void> => {
      const adminId = context.req.userId;
      return teamService.changeRole(adminId, input);
    },
  },
};

export default userResolver;
