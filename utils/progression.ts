
import { RankDetails } from '../types';

// Curve approximation based on PRD:
// Rank 1: 5,000
// Rank 10: 100,000
// Rank 100: 17,500,000
// Using a power curve: Score = C * Rank^P
const MAX_RANK = 100;

// Returns the cumulative score required to REACH a specific rank
export const getScoreForRank = (rank: number): number => {
  if (rank <= 1) return 0;
  
  // Custom curve fitting to match PRD milestones roughly
  // Early game is linear-ish, Late game is exponential
  // Rank 2 requires 5000 XP (Total 5000)
  
  // Formula: Base * (Rank^Exponent)
  // Tuned to hit ~17.5M at Rank 100 and ~5k at Rank 2
  const exponent = 1.8; 
  const base = 5000; 
  
  // Offset to make Rank 1 start at 0
  return Math.floor(base * Math.pow(rank - 1, exponent));
};

export const calculateRankDetails = (totalScore: number): RankDetails => {
  let rank = 1;
  
  // Iterative check is fast enough for 100 ranks
  while (rank < MAX_RANK && totalScore >= getScoreForRank(rank + 1)) {
    rank++;
  }

  const currentRankScoreBase = getScoreForRank(rank);
  const nextRankScoreBase = getScoreForRank(rank + 1);
  
  const progress = totalScore - currentRankScoreBase;
  const toNextRank = nextRankScoreBase - currentRankScoreBase;
  
  return {
    rank,
    progress,
    toNextRank,
    totalScore,
    isMaxRank: rank >= MAX_RANK
  };
};
