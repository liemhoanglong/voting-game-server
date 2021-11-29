export const INTERNAL: string = 'Something went wrong. Please try again later.';
export const EMAIL_ALREADY_EXIST: string = 'This email already exists.';
// eslint-disable-next-line max-len
export const EMAIL_REGISTERED_BY_THIRD_PARTY: string = 'Your account was registered via Google or Facebook. Please login with Google or Facebook.';
export const INCORRECT_EMAIL: string = 'Incorrect email.';
export const INCORRECT_PASSWORD = (time: number) => `Incorrect password. You have ${time} login attempt(s) left.`;
export const BLOCK_LOGIN = (minute: number) => `Your account has been temporarily blocked for ${minute} minute(s).`;
export const WRONG_AUTH_TYPE: string = 'Your account was registered via Google or Facebook. Please login with Google or Facebook.';
export const UNVERIFIED_USER: string = 'This account is not verified yet. Please check your email and try again.';
export const UNREGISTERED: string = 'This email is not registered. Please try again.';
export const BLOCK_RESET_PASSWORD = 'You\'ve reached the daily limit for resetting password. Please try again tomorrow.';
export const BLOCK_RESEND_VERIFICATION = 'You\'ve reached the daily limit for resending verification email. Please try again tomorrow.';
export const EXIST_PASSWORD = 'You\'ve used this password recently. Please use another password.';
export const TOKEN_EXPIRED = 'Your token has expired. Please try again';
export const EMAIL_VERIFIED = 'Your email has already been verified.';
export const RESET_PASSWORD_FOR_THIRD_PARTY = 'This email address is currently being used with Google or Facebook.';
export const USER_NOT_FOUND: string = 'This email has not registered by any user yet.';
export const TEAM_NOT_FOUND: string = 'Team not found!';
export const NOT_IN_TEAM: string = 'You are not in this team!';
