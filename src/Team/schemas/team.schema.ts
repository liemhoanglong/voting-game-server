import * as mongoose from 'mongoose';
import { ITeam } from 'Team/interfaces/team.interface';
import * as VotingSystem from 'constants/votingSystem.constant';

const { Schema } = mongoose;

const TeamSchema = new Schema({
  name: String,
  createdAt: {
    type: Date,
    default: Date.now(),
  },
  votingSystem: {
    type: Number,
    default: VotingSystem.FIBONACCI,
  },
  urlImage: {
    default: {},
    url: { type: String },
    id: { type: String },
  },
});

mongoose.model('Team', TeamSchema);

export default mongoose.model<ITeam>('Team');
