import { ReadStream } from 'fs-capacitor';

export interface ITeam {
  _id: string;
  name: string;
  createdDate: Date;
  votingSystem: number;
  urlImage: {
    url: string,
    id: string,
  }
}

export interface ICreateMemberInput {
  email: string;
  role: number;
}

export interface IJiraProject {
  id: string;
  key: string;
  name: string;
}

export interface IJiraAccess {
  jiraToken: string;
  jiraCloudId: string;
  jiraUrl: string;
}

export interface JiraAuthImport {
  project: string;
  jiraToken: string;
  jiraCloudId: string;
  url: string;
  page: number;
  limit: number;
}

export interface IImportCard {
  issue: string;
  voteScore: number;
  link: string;
  description: string;
}

export interface ICreateCard {
  _id: string;
  issue: string;
  voteScore: number;
  link: string;
  description: string;
  createAt: Date;
}

export interface CardIssueInput extends ICreateCard {
  teamId: string;
}

export interface IGameState {
  _id: string;
  urlImage: {
    url: string,
    id: string,
  };
  name: string;
  allUserState: {
    _id: string,
    email: string,
    name: string,
    role: number,
    cardState: number,
  }[]
  votingSystem: number;
  currentPoint: number;
  role: number;
  isHost: boolean;
  currentCard: string;
}

export interface IGameSubscription {
  code: string;
  userAction?: {
    _id: string,
    cardState?: number,
    role?: number,
    isHost?: boolean,
  }
  cardValues?: {
    _id: string,
    point: number,
  }[]
  timer?: {
    timer: number,
    timerLeft?: number,
  }
  cardIssue?: {
    _id: string,
    issue?: string,
    voteScore?: number,
    link?: string,
    description?: string,
    createAt?: Date,
  }
  cardIssues?: {
    _id?: string,
    issue?: string,
    voteScore?: number,
    link?: string,
    description?: string,
    createAt?: Date,
  }[]
  currentPoint?: number,
  newMember?: {
    userId: string,
    email: string,
    name: string,
    role: number,
  }[]
}

export interface IFile {
  filename: string,
  mimetype: string,
  encoding: string,
  createReadStream(): ReadStream;
}
