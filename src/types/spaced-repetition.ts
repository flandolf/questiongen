export type SpacedRepetitionCard = {
  easinessFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewDate: string;
  lastQuality: number;
  totalReviews: number;
  correctReviews: number;
};

export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
