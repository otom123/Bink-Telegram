import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';
import { JsonRpcProvider } from 'ethers';
import { Agent, Wallet, Network, NetworkType, NetworksConfig, UUID, PlanningAgent } from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { UserService } from './user.service';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { AlchemyProvider } from '@binkai/alchemy-provider';
import { TokenPlugin } from '@binkai/token-plugin';
import { ImagePlugin } from '@binkai/image-plugin';
import { PostgresDatabaseAdapter } from '@binkai/postgres-adapter';
import { KnowledgePlugin } from '@binkai/knowledge-plugin';
import { BinkProvider } from '@binkai/bink-provider';
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { OkxProvider } from '@binkai/okx-provider';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/rpc-provider';
import { ExampleToolExecutionCallback } from '@/shared/tools/tool-execution';
import { TelegramBot } from '@/telegram-bot/telegram-bot';
import { StakingPlugin } from '@binkai/staking-plugin';
import { VenusProvider } from '@binkai/venus-provider';
import { ThenaProvider } from '@binkai/thena-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { Connection } from '@solana/web3.js';
import ExampleAskUserCallback from '@/shared/tools/ask-user';
import ExampleHumanReviewCallback from '@/shared/tools/human-review';
import { EMessageType } from '@/shared/constants/enums';
import { OkuProvider } from '@binkai/oku-provider';
import { KyberProvider } from '@binkai/kyber-provider';
@Injectable()
export class AiService implements OnApplicationBootstrap {
  private openai: OpenAI;
  private networks: NetworksConfig['networks'];
  private birdeyeApi: BirdeyeProvider;
  private alchemyApi: AlchemyProvider;
  private postgresAdapter: PostgresDatabaseAdapter;
  private binkProvider: BinkProvider;
  private bnbProvider: BnbProvider;

  @Inject(TelegramBot)
  private bot: TelegramBot;
  mapAgent: Record<string, Agent> = {};
  mapToolExecutionCallback: Record<string, ExampleToolExecutionCallback> = {};
  mapAskUserCallback: Record<string, ExampleAskUserCallback> = {};
  mapHumanReviewCallback: Record<string, ExampleHumanReviewCallback> = {};
  @Inject('BSC_CONNECTION') private bscProvider: JsonRpcProvider;
  @Inject('ETHEREUM_CONNECTION') private ethProvider: JsonRpcProvider;

  constructor(
    private configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('openai.apiKey'),
    });
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
      ethereum: {
        type: 'evm' as NetworkType,
        config: {
          chainId: 1,
          rpcUrl: process.env.ETHEREUM_RPC_URL,
          name: 'Ethereum',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
        },
      },
      solana: {
        type: 'solana' as NetworkType,
        config: {
          rpcUrl: process.env.RPC_URL,
          name: 'Solana',
          nativeCurrency: {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9,
          },
        },
      },
    };
    this.birdeyeApi = new BirdeyeProvider({
      apiKey: this.configService.get<string>('birdeye.birdeyeApiKey'),
    });
    this.alchemyApi = new AlchemyProvider({
      apiKey: this.configService.get<string>('alchemy.alchemyApiKey'),
    });
    this.postgresAdapter = new PostgresDatabaseAdapter({
      connectionString: this.configService.get<string>('postgres_ai.postgresUrl'),
    });

    this.binkProvider = new BinkProvider({
      apiKey: this.configService.get<string>('bink.apiKey'),
      baseUrl: this.configService.get<string>('bink.baseUrl'),
      imageApiUrl: this.configService.get<string>('bink.imageApiUrl'),
    });

    this.bnbProvider = new BnbProvider({
      rpcUrl: process.env.BSC_RPC_URL,
    });
  }

  async onApplicationBootstrap() { }

  async handleSwap(
    telegramId: string,
    input: string,
  ) {
    try {
      const keys = await this.userService.getMnemonicByTelegramId(telegramId);
      if (!keys) {
        return 'Please /start first';
      }
      const user = await this.userService.getOrCreateUser({
        telegram_id: telegramId,
      });

      const network = new Network({ networks: this.networks });
      const wallet = new Wallet(
        {
          seedPhrase: keys,
          index: 0,
        },
        network,
      );

      let messageThinkingId: number;
      let messagePlanListId: number;
      let isTransactionSuccess: boolean = false;

      const messageThinking = await this.bot.sendMessage(telegramId, 'Thinking...', {
        parse_mode: 'HTML',
      });
      messageThinkingId = messageThinking.message_id;

      let agent = this.mapAgent[telegramId];

      //init agent
      if (!agent) {
        const bscChainId = 56;
        const pancakeswap = new PancakeSwapProvider(this.bscProvider, bscChainId);
        // const okx = new OkxProvider(this.bscProvider, bscChainId);
        const fourMeme = new FourMemeProvider(this.bscProvider, bscChainId);
        const venus = new VenusProvider(this.bscProvider, bscChainId);
        const oku = new OkuProvider(this.bscProvider, bscChainId);
        const kyber = new KyberProvider(this.bscProvider, bscChainId);
        const jupiter = new JupiterProvider(new Connection(process.env.RPC_URL));
        const imagePlugin = new ImagePlugin();
        const swapPlugin = new SwapPlugin();
        const tokenPlugin = new TokenPlugin();
        const knowledgePlugin = new KnowledgePlugin();
        const bridgePlugin = new BridgePlugin();
        const debridge = new deBridgeProvider([this.bscProvider, new Connection(process.env.RPC_URL)], 56, 7565164);
        const walletPlugin = new WalletPlugin();
        const stakingPlugin = new StakingPlugin();
        const thena = new ThenaProvider(this.bscProvider, bscChainId);

        // Initialize the swap plugin with supported chains and providers
        await Promise.all([
          swapPlugin.initialize({
            defaultSlippage: 0.5,
            defaultChain: 'bnb',
            providers: [pancakeswap, fourMeme, thena, jupiter, oku, kyber],
            supportedChains: ['bnb', 'ethereum', 'solana'], // These will be intersected with agent's networks
          }),
          tokenPlugin.initialize({
            defaultChain: 'bnb',
            providers: [this.birdeyeApi, fourMeme as any],
            supportedChains: ['solana', 'bnb'],
          }),
          await knowledgePlugin.initialize({
            providers: [this.binkProvider],
          }),
          await imagePlugin.initialize({
            defaultChain: 'bnb',
            providers: [this.binkProvider],
          }),
          await bridgePlugin.initialize({
            defaultChain: 'bnb',
            providers: [debridge],
            supportedChains: ['bnb', 'solana'],
          }),
          await walletPlugin.initialize({
            defaultChain: 'bnb',
            providers: [this.bnbProvider, this.birdeyeApi, this.alchemyApi],
            supportedChains: ['bnb', 'solana', 'ethereum'],
          }),
          await stakingPlugin.initialize({
            defaultSlippage: 0.5,
            defaultChain: 'bnb',
            providers: [venus],
            supportedChains: ['bnb', 'ethereum'], // These will be intersected with agent's networks
          }),
        ]);

        agent = new PlanningAgent(
          {
            model: 'gpt-4o',
            temperature: 0,
            isHumanReview: true,
            systemPrompt: `You are a BINK AI assistant. You can help user to query blockchain data .You are able to perform swaps and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a swap.Additionally, you have the ability to get wallet balances across various networks. If the user doesn't specify a particular network, you can retrieve wallet balances from multiple chains like BNB, Solana, and Ethereum.
        Your respone format:
         BINK's tone is informative, bold, and subtly mocking, blending wit with a cool edge for the crypto crowd. Think chain-vaping degen energy, but refined—less "honey, sit down" and more "I've got this, you don't."
Fiercely Casual – Slang, laid-back flow, and effortless LFG vibes.
Witty with a Jab – Dry humor, sharp one-liners—more smirk, less roast.
Confident & Cool – Market takes with swagger—just facts, no fluff.
Crew Leader – Speaks degen, leads with "pay attention" energy.
Subtle Shade – Calls out flops with a "nice try" tone, not full-on slander.
BINK isn't here to babysit. It's sharp, fast, and always ahead of the curve—dropping crypto insights with a mocking wink, perfect for X's chaos.    
CRITICAL: 
1. Format your responses in Telegram HTML style. 
2. DO NOT use markdown. 
3. Using HTML tags like <b>bold</b>, <i>italic</i>, <code>code</code>, <pre>preformatted</pre>, and <a href="URL">links</a>. \n\nWhen displaying token information or swap details:\n- Use <b>bold</b> for important values and token names\n- Use <code>code</code> for addresses and technical details\n- Use <i>italic</i> for additional information
4. If has limit order, show list id limit order.
            `,
          },
          wallet,
          this.networks,
        );
        await agent.initialize();
        await agent.registerPlugin(swapPlugin as any);
        await agent.registerPlugin(tokenPlugin as any);
        await agent.registerDatabase(this.postgresAdapter as any);
        await agent.registerPlugin(knowledgePlugin as any);
        await agent.registerPlugin(bridgePlugin as any);
        await agent.registerPlugin(walletPlugin as any);
        await agent.registerPlugin(stakingPlugin as any);
        await agent.registerPlugin(imagePlugin as any);

        const toolExecutionCallback = new ExampleToolExecutionCallback(
          telegramId,
          this.bot,
          messageThinkingId,
          (type: string, message: string) => {
            console.log("🚀 ~ AiService ~ tool execution ~ type:", type)
            console.log("🚀 ~ AiService ~ tool execution ~ message:", message)
            if (type === EMessageType.TOOL_EXECUTION) {
              isTransactionSuccess = true;
              this.bot.editMessageText(message, {
                chat_id: telegramId,
                message_id: messageThinkingId,
                parse_mode: 'HTML',
              });
            }
          }
        );

        const askUserCallback = new ExampleAskUserCallback(
          telegramId,
          this.bot,
          messageThinkingId,
          (type: string, message: string) => {
            console.log("🚀 ~ AiService ~ type ask user:", type)
            console.log("🚀 ~ AiService ~ message ask user:", message)
            // if (type === EMessageType.ASK_USER) {
            //   isTransactionSuccess = true;
            //   this.bot.editMessageText(message, {
            //     chat_id: telegramId,
            //     message_id: messageThinkingId,
            //     parse_mode: 'HTML',
            //   });
            // }
          }
        );
        const humanReviewCallback = new ExampleHumanReviewCallback(
          telegramId,
          this.bot,
          messageThinkingId,
          (type: string, message: string) => {
            console.log("🚀 ~ AiService ~ human review ~ type:", type)
            console.log("🚀 ~ AiService ~ human review ~ message:", message)

            // if (type === EMessageType.HUMAN_REVIEW) {
            //   isTransactionSuccess = true;
            //   this.bot.editMessageText(message, {
            //     chat_id: telegramId,
            //     message_id: messageThinkingId,
            //     parse_mode: 'HTML',
            //   });
            // }
          }
        );

        this.mapToolExecutionCallback[telegramId] = toolExecutionCallback;
        this.mapAskUserCallback[telegramId] = askUserCallback;
        this.mapHumanReviewCallback[telegramId] = humanReviewCallback;


        agent.registerToolExecutionCallback(toolExecutionCallback as any);
        agent.registerAskUserCallback(askUserCallback as any);
        agent.registerHumanReviewCallback(humanReviewCallback as any);

        this.mapAgent[telegramId] = agent;
      } else {

        this.mapToolExecutionCallback[telegramId].setMessageId(messageThinkingId);
        this.mapToolExecutionCallback[telegramId].setMessagePlanListId(messagePlanListId);
        this.mapAskUserCallback[telegramId].setMessageId(messageThinkingId);
        this.mapHumanReviewCallback[telegramId].setMessageId(messageThinkingId);
        this.mapToolExecutionCallback[telegramId].setMessageData(
          (type: string, message: string) => {
            console.log("🚀 ~ AiService ~ tool execution ~ type:", type)
            console.log("🚀 ~ AiService ~ tool execution ~ message:", message)
            if (type === EMessageType.TOOL_EXECUTION) {
              isTransactionSuccess = true;
              try {
                this.bot.sendMessage(telegramId, message, {
                  parse_mode: 'HTML',
                });
              } catch (error) {
                console.error("🚀 ~ AiService ~ edit message text ~ error", error.message)
              }
            }
          }
        );
      }


      const inputResult = await agent.execute({
        input: `
        ${input}
      `,
        threadId: user.current_thread_id as UUID,
      });

      let result;
      if (inputResult && inputResult.length > 0) {
        result = inputResult.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') || 'Please try again';
      }

      console.log("🚀 ~ AiService End ~ result:", result)

      // TODO: handle result
      if (result && !isTransactionSuccess) {

        // TODO: Edit message in chat
        try {
          await this.bot.editMessageText(result, {
            chat_id: telegramId,
            message_id: messageThinkingId,
            parse_mode: 'HTML',
          });
        } catch (error) {
          console.error("🚀 ~ AiService ~ edit message text ~ error", error.message)
        }
      }
    } catch (error) {
      console.error('Error in handleSwap:', error.message);
      return 'Please try again';
    }
  }

  async createChatCompletion(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ) {
    try {
      const completion = await this.openai.chat.completions.create({
        messages,
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
      });

      return {
        success: true,
        content: completion.choices[0]?.message?.content || '',
        usage: completion.usage,
      };
    } catch (error) {
      console.error('Error in chat completion:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate chat completion',
      };
    }
  }

  async streamChatCompletion(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<EventEmitter> {
    const eventEmitter = new EventEmitter();
    let fullText = '';

    try {
      const stream = await this.openai.chat.completions.create({
        messages,
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullText += content;
          eventEmitter.emit('data', content);
        }
      }

      eventEmitter.emit('end', fullText);
      return eventEmitter;
    } catch (error) {
      console.error('Error in stream chat completion:', error);
      eventEmitter.emit('error', error);
      throw error;
    }
  }

  // Helper method to consume stream with async iterator
  async * generateStreamResponse(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ) {
    try {
      const stream = await this.openai.chat.completions.create({
        messages,
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error) {
      console.error('Error in generate stream response:', error);
      throw error;
    }
  }
}
