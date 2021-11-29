import { Document, PopulatedDoc } from 'mongoose';

import { IUser } from 'User/interfaces/user.interface';
import { ITeam } from 'Team/interfaces/team.interface';

export interface IMembership {
  _id: string;
  team: PopulatedDoc<ITeam & Document>;
  user: PopulatedDoc<IUser & Document>;
  role: number;
}
