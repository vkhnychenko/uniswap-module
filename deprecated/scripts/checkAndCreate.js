import fs from "fs";
import path from "path";
import { getPoolInfo } from "../../pool.js";
import {
  getPositionInfo,
  getPositionIds
} from "../../position.js";
import {removeLiquidity, mintPosition} from '../../liquidity.js'
import { getTokenBalance, getNativeBalance, getGasPrice, getPrice } from "../balance.js";
import { CurrentConfig, nativeToken, logger, maxPriceCoefficient, minPriceCoefficient } from "../../config.js";
import CoinMarketCap from 'coinmarketcap-api'
import {swapToken1Inch} from '../../swap.js'
import {insertData} from '../database.js'
import moment from 'moment'
import dotenv from 'dotenv'
dotenv.config()

const resultFilePath = path.resolve('./data/postitionResult.json')
const closedPositionFilePath = path.resolve("./data/closedPositionIds.txt");
const client = new CoinMarketCap(process.env.COINMARKET_API_KEY)

async function getPrices(tickers){
    try{
        const query = {symbol: tickers}
        const res = await client.getQuotes(query)
        let prices = {}
        for (let ticker of tickers.split(',')){
            prices[`${ticker}`] = res.data[`${ticker}`].quote.USD.price;
        }

        return prices
    } catch {
        console.error
    }
    
}



async function checkCurrentPositions() {
  let data = fs.readFileSync(closedPositionFilePath, "utf8");
  const closedPositionIds = data.split("\n");
  logger.info(`closedPositionIds ${closedPositionIds}`, );

  let newClosedPositionIds = [];

  const positionIds = await getPositionIds();
  const poolInfo = await getPoolInfo();

  for (let positionId of positionIds) {
    if (!closedPositionIds.includes(positionId)) {
      logger.info(`positionId: ${positionId}`);
      const positionInfo = await getPositionInfo(positionId);
      logger.info(`positionInfo.liquidity ${positionInfo.liquidity}`)
      logger.info(`poolInfo.tick: ${poolInfo.tick}`)
      logger.info(`positionInfo.tickUpper ${positionInfo.tickUpper}`)
      logger.info(`positionInfo.tickLower: ${positionInfo.tickLower}`) 

      if (
        positionInfo.liquidity > 0 &&
        (poolInfo.tick > positionInfo.tickUpper ||
          poolInfo.tick < positionInfo.tickLower)
      ) {
        await removeLiquidity(positionId, poolInfo, positionInfo);
        newClosedPositionIds.push(positionId);
      }

      if (positionInfo.liquidity == 0) {
        newClosedPositionIds.push(positionId);
      }
    }
  }
  for (let closedPositionId of newClosedPositionIds) {
    fs.appendFileSync(closedPositionFilePath, closedPositionId + "\n", (err) => {
      if (err) throw err;
      logger.info(`closedPositionId has been added! ${closedPositionId}`);
    });
  }
}

async function createPosition(token0Balance, token1Balance) {
    let data = fs.readFileSync(closedPositionFilePath, "utf8");
    const closedPositionIds = data.split("\n");
    logger.info(`closedPositionIds: ${closedPositionIds}`);

    let activePosition = [];

    const positionIds = await getPositionIds();
    const poolInfo = await getPoolInfo();

    for (let positionId of positionIds) {
        if (!closedPositionIds.includes(positionId)) {
            logger.info(`positionId: ${positionId}`);
            const positionInfo = await getPositionInfo(positionId);
            if (
                positionInfo.liquidity > 0 &&
                (poolInfo.tick < positionInfo.tickUpper ||
                  poolInfo.tick > positionInfo.tickLower)
              ) {
                activePosition.push(positionId)
              }
            }
        }

    if (activePosition.length == 0){
        await mintPosition(
            CurrentConfig.tokens.token0,
            CurrentConfig.tokens.token1,
            token0Balance,
            token1Balance
        );
    }
}

async function main() {

    const gasPrice = await getGasPrice()
    logger.info(`Current gas price: ${gasPrice}`)
    if (gasPrice > 10){
        return
    }

    await checkCurrentPositions();

    const databaseName = 'farming'
    const collectionName = 'position'
    const token0 = CurrentConfig.tokens.token0
    const token1 = CurrentConfig.tokens.token1
    
    const prices = await getPrices(`${token0.name},${token1.name}`)
    console.log('prices', prices)

    let token0Balance = await getTokenBalance(token0);
    logger.info(`token0Balance: ${token0Balance}`);

    let token1Balance = await getTokenBalance(token1);
    logger.info(`token1Balance: ${token1Balance}`);

    const token0Price = prices[`${token0.name}`]
    const token1Price = prices[`${token1.name}`]

    const sumToken0 = token0Balance * token0Price
    const sumToken1 = token1Balance * token1Price

    const priceCoefficient = sumToken0/sumToken1
    console.log('sumToken0', sumToken0)
    console.log('sumToken1', sumToken1)
    console.log('priceCoefficient', priceCoefficient)

    let amountForSwap = 0
    let tokenInAddress
    let tokenOutAddress
    let decimal
    if (priceCoefficient > maxPriceCoefficient){

        amountForSwap = (sumToken0 - sumToken1) / 2 / token0Price
        console.log('amountForSwap', amountForSwap)
        console.log('token1 need swap', amountForSwap * token0Price / token1Price)
        tokenInAddress = token0.address
        tokenOutAddress = token1.address
        decimal = token0.decimals

    } else if (priceCoefficient < minPriceCoefficient){
        amountForSwap = (sumToken1 - sumToken0) / 2 / token1Price
        console.log('amountForSwap', amountForSwap)
        console.log('token0 need swap', amountForSwap * token1Price / token0Price)
        tokenInAddress = token1.address
        tokenOutAddress = token0.address
        decimal = token1.decimals
    }


    if (amountForSwap != 0){
        console.log('amountForSwap', (amountForSwap * 10 ** decimal).toFixed())
        await swapToken1Inch(tokenInAddress, tokenOutAddress, amountForSwap.toString(), decimal)

        let token0Balance = await getTokenBalance(token0);
        let token1Balance = await getTokenBalance(token1);
    }

    logger.info(`newToken0Balance: ${token0Balance}`);
    logger.info(`newToken1Balance: ${token1Balance}`);
    await createPosition(token0Balance, token1Balance)

    const data = {
        date : moment().toISOString(),
        token0: token0.name,
        token1: token1.name,
        token0Balance,
        token1Balance,
        sumToken0,
        sumToken1,
    }
    try{
        await insertData(databaseName, collectionName, data)
    } catch {
        fs.appendFileSync(resultFilePath, JSON.stringify(data) + '\n')
    }

}

main()