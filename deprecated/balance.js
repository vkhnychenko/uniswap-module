import { ethers } from 'ethers'
import { ERC20_ABI } from '../constants.js'
import {getWalletAddress, getProvider} from '../providers.js'

export async function getTokenBalance(token){
  const provider = getProvider()
  const address = getWalletAddress()

  const currencyContract = new ethers.Contract(token.address, ERC20_ABI, provider)
  const balance = await currencyContract.balanceOf(address)
  const decimals = await currencyContract.decimals()

  return ethers.utils.formatUnits(balance, decimals)
}

export async function getNativeBalance(){
  const provider = getProvider()
  const address = getWalletAddress()

  return ethers.utils.formatEther(await provider.getBalance(address))
}

export async function getGasPrice(){
  const provider = getProvider()
  return ethers.utils.formatUnits(await provider.getGasPrice(), 'gwei')
}

export async function getPrice(tokenName){
  const url = 'https://api.gateio.ws/api/v4/spot/tickers'
  let response = await fetch(url);
  if (response.ok) {
      let json = await response.json();
      const priceArray = json.find(price => price.currency_pair == `${tokenName}_USDT`)
      console.log(priceArray[0])
      return priceArray[0].last
    } else {
      alert("Ошибка HTTP: " + response.status);
    }
}