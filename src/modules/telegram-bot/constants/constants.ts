export const USER_INPUT = 'user_input';

export const TELEGRAM_BOT_STATE = 'telegram_bot_state';

export const MAX_TIME_STATE_OUT_DATE = 60 * 1000; //1 minute
export const MAX_TIME_PRICE_OUT_DATE = 10 * 1000; //1 minute
export const MAX_TIME_WEI_OUT_DATE = 10 * 1000; //1 minute
export const EXPIRED_ORDER_SECOND = 60 * 60 * 12;

export const BOT_STATES = {
  WAITING_TOKEN_INPUT: "WAITING_TOKEN_INPUT",
  WAITING_CUSTOM_AMOUNT: "WAITING_CUSTOM_AMOUNT",
  WAITING_CUSTOM_PERCENTAGE: "WAITING_CUSTOM_PERCENTAGE",
} as const;
