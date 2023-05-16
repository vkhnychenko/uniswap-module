import {Telegraf} from 'telegraf'

export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN
export const TELEGRAM_IDS = process.env.TELEGRAM_IDS.split(',')


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