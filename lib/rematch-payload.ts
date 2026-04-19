export type RematchPayload = {
  targetCode: string;
  targetStatus: "lobby" | "playing" | "finished";
  joinedOldPlayerIds: string[];
};
