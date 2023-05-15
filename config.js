import { FeeAmount } from '@uniswap/v3-sdk'
import { ethers } from "ethers"
import { SupportedChainId, Token, Percent, CurrencyAmount, TradeType } from '@uniswap/sdk-core'
import winston from 'winston'

// export const nativeToken = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

// Pool info
export const TOKEN0 = new Token(SupportedChainId.ARBITRUM_ONE, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 18, 'WETH', 'ETH')
export const TOKEN1 = new Token(SupportedChainId.ARBITRUM_ONE, '0x912CE59144191C1204E64559FE8253a0e49E6548', 18, 'ARB', 'ARB')
export const FEE = FeeAmount.MEDIUM
export const TICK_UPPER_MULTIPLIER=25
export const TICK_LOWER_MULTIPLIER=25
export const MAX_PRICE_COEFFICIENT = 1.2
export const MIN_PRICE_COEFFICIENT = 0.8

// Transactions
export const MAX_FEE_PER_GAS = ethers.utils.parseUnits("0.3", 'gwei')
export const MAX_PRIORITY_FEE_PER_GAS = ethers.utils.parseUnits("0.1", 'gwei')
export const MIN_SUM_BALANCE = 100
export const GAS_LIMIT = 3_000_000


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