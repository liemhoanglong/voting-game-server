export interface IUser {
  _id: string;
  email: string;
  name: string;
  password: string;
  isVerified: boolean;
  createAt: Date;
  authType: number;
}

export interface ILoginSuccess {
  token: string,
  name: string,
  email: string,
}

export interface IUserPublicInfo {
  userId: string,
  email: string;
  name: string;
}

export interface ITeamInfo {
  adminId: string,
  teamId: string,
  name: string,
  teamLink: string,
  urlImage:{
    url: string,
    id: string,
  }
}
