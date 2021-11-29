import * as mongoose from 'mongoose';
import { IUser } from 'User/interfaces/user.interface';
import { AUTH_TYPE } from '../../constants/userAuthType.constant';

const { Schema } = mongoose;

const UserSchema = new Schema({
  name: String,
  email: {
    type: String,
    index: { unique: true },
  },
  password: String,
  isVerified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  authType: {
    type: Number,
    default: AUTH_TYPE.EMAIL,
  },
  stripeCustomerId: String,
});

mongoose.model('User', UserSchema);

export default mongoose.model<IUser>('User');
