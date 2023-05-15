import fs from "fs";
import path from "path";
import { getPoolInfo } from "../pool.js";
import {
  getPositionInfo,
  getPositionIds
} from "../position.js";
import { CurrentConfig, nativeToken, logger } from "../config.js";
import {
  removeLiquidity,
  swapAndAddLiquidity,
  mintPosition,
} from "../liquidity.js";
import { BigNumber, ethers } from 'ethers'
import { getTokenBalance, getNativeBalance, getGasPrice, getPrice } from "../balance.js";
import {swapEthForToken1Inch} from '../swap.js'
import {getProvider} from '../providers.js'
import dotenv from 'dotenv'
import log from "log"

import * as Sentry from "@sentry/node";

// Importing @sentry/tracing patches the global hub for tracing to work.
import "@sentry/tracing";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",

  // We recommend adjusting this value in production, or using tracesSampler
  // for finer control
  tracesSampleRate: 1.0,
});

dotenv.config()

const closedPositionFilePath = path.resolve("./data/closedPositionIds.txt");

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
async function addLiquidity(token0Balance, token1Balance) {
  let data = fs.readFileSync(closedPositionFilePath, "utf8");
  const closedPositionIds = data.split("\n");
  logger.info(`closedPositionIds ${closedPositionIds}`);

  const positionIds = await getPositionIds();
  const poolInfo = await getPoolInfo();

  for (let positionId of positionIds) {
    if (!closedPositionIds.includes(positionId)) {
      const positionInfo = await getPositionInfo(positionId);
      if (
        positionInfo.liquidity > 0 &&
        poolInfo.tick < positionInfo.tickUpper &&
        poolInfo.tick > positionInfo.tickLower &&
        poolInfo.token0 == positionInfo.token0 &&
        poolInfo.token1 == positionInfo.token1
      ) {
        await swapAndAddLiquidity(
          positionId,
          poolInfo,
          positionInfo,
          token0Balance,
          token1Balance
        );
        break
      }
    }
  }
}

async function main() {


    // try{
    //     let data = fs.readFileSync("./data/closedPositionIdss.txt", "utf8");
    //     const closedPositionIds = data.split("\n");
    //     logger.info("closedPositionIds", closedPositionIds);}
    // catch(err){
    //     logger.info('err', err)
    // }
    const gasPrice = await getGasPrice()
    logger.info(`Current gas price: ${gasPrice}`)
    if (gasPrice > 10){
        return
    }

    const price = await getPrice('ETH')
    console.log(price)
    return

    // const nativeBalance = await getNativeBalance()
    // const minNativeBalance = process.env.MIN_NATIVE_BALANCE

    // if (parseFloat(nativeBalance) > parseFloat(minNativeBalance)){ 
    //     await swapEthForToken1Inch(nativeToken, CurrentConfig.tokens.token0.address,  (nativeBalance - minNativeBalance).toString())
    // }

    await checkCurrentPositions();

    const token0Balance = await getTokenBalance(CurrentConfig.tokens.token0);
    logger.info(`token0Balance: ${token0Balance}`);

    const token1Balance = await getTokenBalance(CurrentConfig.tokens.token1);
    logger.info(`token1Balance: ${token1Balance}`);

    await createPosition(token0Balance, token1Balance)

    

    // if (token0Balance < 10 && token1Balance > 20) {
    //     await swapEthForToken1Inch(CurrentConfig.tokens.token1.address, CurrentConfig.tokens.token0.address,  (nativeBalance - minNativeBalance).toString())
    // } else {
    //     await swapEthForToken1Inch(CurrentConfig.tokens.token0.address, CurrentConfig.tokens.token1.address,  (nativeBalance - minNativeBalance).toString())
    // }

    // if (token0Balance > 10 || token1Balance > 10) {
    //     //TODO need swap token function
    //     await addLiquidity(token0Balance, token1Balance)
    // }
}

main()
