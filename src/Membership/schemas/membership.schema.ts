import * as mongoose from 'mongoose';
import { IMembership } from 'Membership/interfaces/membership.interface';
import { MEMBERSHIP_ROLE } from 'constants/membershipRole.constant';

const { Schema } = mongoose;

const MembershipSchema = new Schema({
  team: {
    type: Schema.Types.ObjectId,
    ref: 'Team',
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  role: {
    type: Number,
    default: MEMBERSHIP_ROLE.MEMBER,
  },
});

mongoose.model('Membership', MembershipSchema);

export default mongoose.model<IMembership>('Membership');
