import { logger } from "./config.js"
import { sendMessageToTelegram } from "./src/telegramBot.js"

const txInfo = {
    data: 1,
    to: 2,
    value: 3,
    gasLimit: 4,
    // maxFeePerGas: this.maxFeePerGas,
    // maxPriorityFeePerGas: this.maxPriorityFeePerGas,
}

// logger.info(`txInfo: ${txInfo.toString()}`)
// logger.info(txInfo)
// logger.info(`txInfo: ${txInfo.data}`)
// logger.info(`txInfo:`, txInfo.data)

const minTokenBalance0 = 20
const minTokenBalance1 = 0
const minDifferenceSum = 20


const price0 = 1.5
const price1 = 1800

const balance0 = 3000 
const balance1 = 1

const sum0 = price0 * (balance0 - minTokenBalance0)
const sum1 = price1 * (balance1 - minTokenBalance1) 

// console.log(balance0 % balance1)
// console.log(balance1 % balance0)
const differenceSum = Math.abs(sum0 - sum1)
console.log(differenceSum)
console.log(Math.abs(sum1 - sum0))

if (differenceSum > minDifferenceSum){
    let amountIn = 0
    let sumIn = 0
    let sumOut = 0
    let priceIn = 0
    let tokenIn = ''
    let tokenOut = ''
    if (sum0 > sum1){
        sumIn = sum0
        sumOut = sum1
        priceIn = price0
        amountIn = differenceSum / 2 / price0
    } else {
        sumIn = sum1
        sumOut = sum0
        priceIn = price1
        amountIn = differenceSum / 2 / price1
    }

    if (!tokenIn){
        console.log('sdsdfdsf')
    }
    console.log(amountIn)
    console.log(priceIn)
    console.log('last sum0', sumIn - amountIn * priceIn)
    console.log('last sum1', sumOut + amountIn * priceIn)

    ///
}

async function main(){
    logger.info(txInfo)
    logger.info('tx info', txInfo)
    logger.info(`tx info: ${JSON.stringify(txInfo, '.')}`)
    // await sendMessageToTelegram('Test')
}

main()
// console.log(sum0)
// console.log(sum1)

