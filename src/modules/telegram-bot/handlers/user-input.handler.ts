import { Inject, Injectable } from '@nestjs/common';
import { ChatId } from 'node-telegram-bot-api';
import { TelegramBot } from '../telegram-bot';
import { Handler } from './handler';
import Redis from 'ioredis';
import { UserService } from '@/business/services/user.service';
import { TokenInfoHandler } from './token-info.handler';
import { TELEGRAM_BOT_STATE, BOT_STATES } from '../constants/constants';
import { isSolanaAddress } from '../utils/solana.utils';
import { CustomPercentageHandler } from './custom-percentage.handler';
import { COMMAND_KEYS } from '../constants';
import { AiService } from '@/business/services/ai.service';
import { FourMemeService } from '@/business/services/fourmeme.service';
import { Network, NetworksConfig, NetworkType, Wallet } from '@binkai/core';

@Injectable()
export class UserInputHandler implements Handler {
  private networks: NetworksConfig['networks'];

  @Inject(TelegramBot)
  private readonly bot: TelegramBot;

  constructor(
    @Inject('TELEGRAM_BOT_STATE')
    private readonly botStateStore: Redis,
    private readonly userService: UserService,
    private readonly aiService: AiService,
    private readonly tokenInfoHandler: TokenInfoHandler,
    private readonly customPercentageHandler: CustomPercentageHandler,
    private readonly fourMemeService: FourMemeService,
  ) {
    // using with fourmeme, support only bnb
    this.networks = {
      bnb: {
        type: 'evm' as NetworkType,
        config: {
          chainId: 56,
          rpcUrl: process.env.BSC_RPC_URL,
          name: 'BNB Chain',
          nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18,
          },
        },
      },
    };
  }

  handler = async (data: {
    chatId: ChatId;
    telegramId: string;
    messageId?: number;
    text: string;
    caption?: string;
    reply_to_message_id?: number;
    photo?: string;
  }) => {
    try {
      const text = data?.text?.replace('/', '');
      //skip if COMMAND_KEYS includes data.text
      if (Object.keys(COMMAND_KEYS).includes(text?.toUpperCase() as any)) {
        return;
      }

      const captionText = data.caption || '';
      let imageUrl = null;
      if (data.photo) {
        const photo = data.photo[data.photo.length - 1] as any; // Get highest resolution photo
        const fileId = photo?.file_id || '';
        const filePath = await this.bot.bot.getFileLink(fileId);
        imageUrl = filePath;
      }

      console.log("🚀 ~ UserInputHandler ~ imageUrl:", imageUrl)

      // handle swap
      await this.aiService.handleSwap(
        data.telegramId,
        imageUrl
          ? `${text}${captionText ? ` ${captionText}` : ''} [Image: ${imageUrl}]`
          : data.text,
      );
    } catch (error) {
      console.error('Error in UserInputHandler:', error);
      // await this.bot.editMessageText('Something went wrong. Please try again', {
      //   chat_id: data.chatId,
      //   message_id: messageErrorId,
      //   parse_mode: 'HTML',
      // });
      await this.bot.sendMessage(data.chatId, 'Something went wrong. Please try again', {
        parse_mode: 'HTML',
      });
    }
  };

  async clearMessage(data: { chatId: ChatId; messageId?: number; replyMessageId?: number }) {
    if (data.messageId) {
      await this.bot.deleteMessage(data.chatId, data.messageId.toString());
    }

    if (data.replyMessageId) {
      await this.bot.deleteMessage(data.chatId, data.replyMessageId.toString());
    }
  }
}

