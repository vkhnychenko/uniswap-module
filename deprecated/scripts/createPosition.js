import * as fs from "fs";
import * as path from 'path';
import {removeLiquidity, mintPosition} from '../../liquidity.js'
import { getTokenBalance, getNativeBalance, getGasPrice, getPrice } from "../../balance.js";
import { CurrentConfig, nativeToken, logger, maxPriceCoefficient, minPriceCoefficient } from "../../config.js";
import CoinMarketCap from 'coinmarketcap-api'
import {swapToken1Inch} from '../../swap.js'
import {insertData} from '../../database.js'
import moment from 'moment'
import dotenv from 'dotenv'
dotenv.config()

const resultFilePath = path.resolve('./data/postitionResult.json')



async function main(){
    const databaseName = 'farming'
    const collectionName = 'position'
    const token0 = CurrentConfig.tokens.token0
    const token1 = CurrentConfig.tokens.token1
    console.log(token1)

    let token0Balance = await getTokenBalance(token0);
    logger.info(`token0Balance: ${token0Balance}`);

    let token1Balance = await getTokenBalance(token1);
    logger.info(`token1Balance: ${token1Balance}`);
    
    const prices = await getPrices(`${token0.name},${token1.name}`)
    console.log('prices', prices)

    // let token0Balance = await getTokenBalance(token0);
    // logger.info(`token0Balance: ${token0Balance}`);

    // let token1Balance = await getTokenBalance(token1);
    // logger.info(`token1Balance: ${token1Balance}`);

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

        // 1200 - 1000 / 2 / 1820

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


    console.log('amountForSwap', amountForSwap)
    if (amountForSwap != 0){
        // await swapToken1Inch(tokenInAddress, tokenOutAddress, amountForSwap.toString(), decimal)

        let token0Balance = await getTokenBalance(token0);
        logger.info(`newToken0Balance: ${token0Balance}`);

        let token1Balance = await getTokenBalance(token1);
        logger.info(`newToken1Balance: ${token1Balance}`);
    }

    const txHash = await mintPosition(token0, token1, token0Balance, token1Balance)
    const data = {
        date : moment().toISOString(),
        token0: token0.name,
        token1: token1.name,
        token0Balance,
        token1Balance,
        sumToken0,
        sumToken1,
        txHash
    }
    try{
        await insertData(databaseName, collectionName, data)
    } catch {
        fs.appendFileSync(resultFilePath, JSON.stringify(data) + '\n')
    }
}

main()