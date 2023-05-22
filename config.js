import { FeeAmount } from '@uniswap/v3-sdk'
import { ethers } from "ethers"
import { SupportedChainId, Token, Percent, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import winston from 'winston'
import dotenv from 'dotenv'
dotenv.config()

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
export const TELEGRAM_IDS = process.env.TELEGRAM_IDS.split(',')

// export const nativeToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

//Main configs
export const MIN_SUM_BALANCE = 100 // USD
export const MIN_DIFFERENCE_SUM = 50 // USD
export const MIN_BALANCE_TOKEN0 = 0
export const MIN_BALANCE_TOKEN1 = 20
export const MIN_BALANCE_TOKEN0_FOR_MINT = 0.01
export const MIN_BALANCE_TOKEN1_FOR_MINT = 10

// Pool info
export const TOKEN0 = new Token(SupportedChainId.ARBITRUM_ONE, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 18, 'WETH', 'ETH')
export const TOKEN1 = new Token(SupportedChainId.ARBITRUM_ONE, '0x912CE59144191C1204E64559FE8253a0e49E6548', 18, 'ARB', 'ARB')
export const FEE = FeeAmount.MEDIUM
export const TICK_UPPER_MULTIPLIER = 20
export const TICK_LOWER_MULTIPLIER = 20

// Transactions
export const CHAIN_NAME = 'ARBITRUM'
export const DEFAULT_GAS_LIMIT = 6_000_000
export const MAX_FEE_PER_GAS = ethers.utils.parseUnits("0.3", 'gwei')
export const MAX_PRIORITY_FEE_PER_GAS = ethers.utils.parseUnits("0.1", 'gwei')

export const logger = winston.createLogger({
  level: 'info',
  // format: winston.format.json(),
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'uniswap-liqudity' },
  // json: true,
  maxsize: 5242880, // 5MB
  maxFiles: 5,
  colorize: false,
  transports: [
    new winston.transports.File({ filename: './logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: './logs/combined.log' }),
  ],
});

//
// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
//
logger.add(new winston.transports.Console({
  format: winston.format.simple(),
}));