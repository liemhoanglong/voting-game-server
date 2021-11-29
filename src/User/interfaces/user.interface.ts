export interface IUser {
  _id: string;
  email: string;
  name: string;
  password: string;
  isVerified: boolean;
  createAt: Date;
  authType: number;
  stripeCustomerId: string;
}

export interface ILoginSuccess {
  token: string,
  name: string,
  email: string,
  stripeCustomerId: string
}

export interface IUserPublicInfo {
  userId: string,
  email: string;
  name: string;
}

export interface IUserInfo extends IUserPublicInfo {
  stripeCustomerId: string;
}

export interface ITeamInfo {
  adminId: string,
  teamId: string,
  name: string,
  teamLink: string,
  urlImage: {
    url: string,
    id: string,
  }
}

export interface Subscription {
  id: string,
  status: string,
  priceId: string,
  interval: string,
  quantity: number,
  created: number,
  currentPeriodStart: number,
  currentPeriodEnd: number,
  cancelAtPeriodEnd: boolean,
}

export interface IInvoice {
  id: string,
  number: string,
  created: number,
  total: number,
  hostedInvoiceUrl: string,
  customerEmail: string,
  subscription: string,
}

export interface ICreateSubscription {
  stripeCustomerId?: string,
  subscriptionId?: string,
  clientSecret?: string,
  message?: string,
}
