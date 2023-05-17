import {Telegraf} from 'telegraf'
import { TELEGRAM_IDS, TELEGRAM_TOKEN } from '../config.js'

const bot = new Telegraf(TELEGRAM_TOKEN)

bot.command('start', async (ctx) => {
    console.log(ctx.chat.id)
    await ctx.reply('Я буду отправлять оповещения по аккаунтам')
})

export async function sendMessageToTelegram(msg){
    for (let chatId of TELEGRAM_IDS) {
        try {
            await bot.telegram.sendMessage(chatId, msg)
        } catch (e){
            console.log(`Error while sendMessage to telegram`, e.message)
        }
    }
}