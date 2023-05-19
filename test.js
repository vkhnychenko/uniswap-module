import { sendMessageToTelegram } from "./src/telegramBot.js"
import { Uniswap } from "./src/uniswap.js"
import { TOKEN0,TOKEN1,FEE } from "./config.js"

const minTokenBalance0 = 0
const minTokenBalance1 = 0
const minDifferenceSum = 200


const price0 = '1797.384940778154'
const price1 = 1.151723798887287

const balance0 = 5.38 
const balance1 = 8399

const sum0 = price0 * (balance0 - minTokenBalance0)
const sum1 = price1 * (balance1 - minTokenBalance1) 

console.log('sum0', sum0)
console.log('sum1', sum1)
const differenceSum = Math.abs(sum0 - sum1)
console.log('differenceSum', differenceSum)

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
    console.log(balance0.toFixed(2))
    console.log(balance1.toFixed(2))
    console.log(Math.round(sum0))
    console.log(Math.round(sum1))
    console.log((+price0).toPrecision(6))
    const uniswap = new Uniswap(TOKEN0, TOKEN1, FEE);
    await uniswap.swapAndMintPosition()
    // await sendMessageToTelegram('Test')
}

main()
