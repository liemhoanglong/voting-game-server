import * as VotingSystem from '../constants/votingSystem.constant';
import * as VotingDeck from '../constants/votingDeck.constant';

export function createDeck(votingSystem: number): Array<number> {
  switch (votingSystem) {
    case VotingSystem.FIBONACCI: return VotingDeck.FIBONACCI;
    default: return VotingDeck.FIBONACCI;
  }
}
