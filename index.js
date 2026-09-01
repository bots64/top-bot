const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('@napi-rs/canvas');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TXT_CHANNEL_ID = '1543093337165144084';
const VC_CHANNEL_ID = '1543093370065260564';
const COINS_PANEL_CHANNEL_ID = '1544164140111626300';
const EXCLUDED_ROLE_ID = '1535875661997277194';

// قائمة الرولات بالترتيب (من الأقدم/الأقل إلى الأعلى)
const ROLE_HIERARCHY = [
    '1535522564061929512',
    '1535403948121395300',
    '1535724553563668561',
    '1535714669270925393',
    '1535714783259787366',
    '1535714856009732179',
    '1535714949085794456',
    '1535715039288496199',
    '1535715153885007912',
    '1535715241739026433',
    '1535715359477203014',
    '1535715454939824158',
    '1535715789187842258',
    '1535715700654604429',
    '1535715983405359144',
    '1535716064921653299',
    '1535716161197576212',
    '1535716253451288647',
    '1535716348947079322',
    '1535718216037568623',
    '1535718336585924608',
    '1535718418664136845',
    '1535718512683913276',
    '1535718767777030237',
    '1535718964683087963',
    '1535718917807538226',
    '1535718879911743619',
    '1535718823301480628',
    '1535719622400020722',
    '1535719580167831583',
    '1535719507727880273',
    '1535719311992164442',
    '1535719270250713161',
    '1535719233655275731',
    '1535719187861864569',
    '1535719144052232212',
    '1535720365127376897',
    '1535774790357614652',
    '1535843524371808306',
    '1535720318776123483',
    '1535720258655227966',
    '1535720208671440988',
    '1535720158092460052',
    '1535720065947668500',
    '1535720112542187560',
    '1535720023384002630',
    '1535719977351389304',
    '1535722770414051328',
    '1535722725706825889',
    '1535722681905979473',
    '1535722615925248151',
    '1535722539706220604',
    '1535722498933530674',
    '1535722454218178580',
    '1535722385175748669',
    '1535722345975775323',
    '1535722303550132284',
    '1535722243542360105',
    '1535722204627599391',
    '1535722173283573760',
    '1535723709929623675',
    '1535723664874676286',
    '1535723604078239784',
    '1535723556426481757',
    '1535723508389257397',
    '1535723441540567050',
    '1535723397231943832',
    '1535723352788836373',
    '1535723308539187352',
    '1535723262204452966',
    '1535723214679052288',
    '1535724212222959777',
    '1535724156791029801',
    '1535724113690099843',
    '1536989468492435496'
];

const db = {
    messages: new Map(),       
    words: new Map(),          
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    messageCounters: new Map(), 
    coins: new Map(),           
    purchases: new Map(),       // تعدد المشتريات لكل عضو
    cooldowns: new Map()       
};

// تصفير البيانات كل 30 يوم
const RESET_INTERVAL = 30 * 24 * 60 * 60 * 1000;
setInterval(() => {
    db.messages.clear();
    db.words.clear();
    db.voiceMinutes.clear();
    db.dailyMessages.clear();
    db.dailyVoice.clear();
    db.messageCounters.clear();
    db.coins.clear();
    db.purchases.clear();
    console.log('Leaderboards and coins have been reset automatically for the 30-day cycle.');
}, RESET_INTERVAL);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    setInterval(updateLeaderboards, 30000);
});

function isExcluded(member) {
    if (!member) return true;
    if (member.user.bot) return true;
    if (member.roles.cache.has(EXCLUDED_ROLE_ID)) return true;
    return false;
}

// تتبع الرسائل (كل رسالة = 1، وكل 5 رسائل = 1 كوين تلقائياً)
client.on('messageCreate', async message => {
    if (isExcluded(message.member)) return;
    
    const userId = message.author.id;
    const wordCount = message.content.trim().split(/\s+/).length;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);

    const currentMsgCount = (db.messageCounters.get(userId) || 0) + 1;
    if (currentMsgCount >= 5) {
        db.messageCounters.set(userId, 0);
        db.coins.set(userId, (db.coins.get(userId) || 0) + 1);
    } else {
        db.messageCounters.set(userId, currentMsgCount);
    }
});

// تتبع الفويس (كل دقيقة = 1 نقطة بأي روم صوتي)
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (isExcluded(member)) return;

    if (!oldState.channelId && newState.channelId) {
        member.voiceJoinTime = Date.now();
    } else if (oldState.channelId && !newState.channelId && member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
        if (durationMins > 0) {
            const userId = member.id;
            const currentMins = db.voiceMinutes.get(userId) || 0;
            db.voiceMinutes.set(userId, currentMins + durationMins);

            const currentDailyMins = db.dailyVoice.get(userId) || 0;
            db.dailyVoice.set(userId, currentDailyMins + durationMins);
        }
        member.voiceJoinTime = null;
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (member.voiceJoinTime) {
            const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
            if (durationMins > 0) {
                const userId = member.id;
                const currentMins = db.voiceMinutes.get(userId) || 0;
                db.voiceMinutes.set(userId, currentMins + durationMins);

                const currentDailyMins = db.dailyVoice.get(userId) || 0;
                db.dailyVoice.set(userId, currentDailyMins + durationMins);
            }
        }
        member.voiceJoinTime = Date.now();
    }
});

async function updateLeaderboards() {
    try {
        const txtChannel = await client.channels.fetch(TXT_CHANNEL_ID).catch(() => null);
        if (txtChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Messages')
                .setColor('#1e1f22')
                .setDescription(getTopMessagesText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('my_stats_txt').setLabel('My Stats').setStyle(ButtonStyle.Secondary)
            );

            const messages = await txtChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await txtChannel.send({ embeds: [embed], components: [row] });
        }

        const vcChannel = await client.channels.fetch(VC_CHANNEL_ID).catch(() => null);
        if (vcChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const messages = await vcChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await vcChannel.send({ embeds: [embed] });
        }

        // لوحة الـ Coins Panel في القناة الجديدة المطلوبة
        const coinsPanelChannel = await client.channels.fetch(COINS_PANEL_CHANNEL_ID).catch(() => null);
        if (coinsPanelChannel) {
            const messages = await coinsPanelChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            const embed = new EmbedBuilder()
                .setTitle('Coins Panel')
                .setColor('#1e1f22')
                .setDescription('هنا يقدر العضو إدارة نقاطه وشراء الرولات بالترتيب وبشكل منظم');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('coins_buy_roles').setLabel('شراء الرولات').setStyle(ButtonStyle.Secondary)
            );

            if (botMessage) {
                await botMessage.edit({ embeds: [embed], components: [row] }).catch(() => {});
            } else {
                await coinsPanelChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error in updateLeaderboards:', err);
    }
}

function getTopMessagesText() {
    const sorted = [...db.words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

// دالة لتوليد الصورة بتصميم خلفية الـ Card تماماً كما طلبت
async function generateProfileCard(member) {
    const canvas = createCanvas(700, 320);
    const ctx = canvas.getContext('2d');

    // خلفية الداكنة المماثلة للصورة (Back-end Card code)
    ctx.fillStyle = '#161917';
    ctx.beginPath();
    ctx.roundRect(0, 0, 700, 320, 24);
    ctx.fill();

    // اسم المستخدم فوق يمين مع الخط تحته
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'right';
    const displayName = member.user.username;
    ctx.fillText(displayName, 650, 65);

    // الخط الأخضر تحت الاسم
    ctx.strokeStyle = '#3e5c4a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(420, 85);
    ctx.lineTo(650, 85);
    ctx.stroke();

    // النصوص (الرصيد الحالي وإجمالي المشتريات بدون الشركات النشطة)
    ctx.textAlign = 'right';

    // 1. الرصيد الحالي
    ctx.fillStyle = '#8c9892';
    ctx.font = '20px sans-serif';
    ctx.fillText('الرصيد الحالي', 650, 130);

    const userCoins = db.coins.get(member.id) || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${userCoins} Coins`, 650, 170);

    // 2. إجمالي المشتريات (عدد المنتجات المشراة)
    ctx.fillStyle = '#8c9892';
    ctx.font = '20px sans-serif';
    ctx.fillText('إجمالي المشتريات', 650, 230);

    const totalPurchases = db.purchases.get(member.id) || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`${totalPurchases} منتج`, 650, 270);

    // صورة المستخدم (Avatar) جهة اليسار بدائرة وإطار أخضر فاخر
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
    try {
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(120, 160, 80, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 40, 80, 160, 160);
        ctx.restore();

        // إطار دائرة الصورة
        ctx.strokeStyle = '#3e5c4a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(120, 160, 80, 0, Math.PI * 2, true);
        ctx.stroke();
    } catch (e) {
        console.error('Error loading avatar for image generation:', e);
    }

    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'profile-card.png' });
}

// معالجة الأزرار والتفاعلات
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'my_stats_txt') {
            await interaction.deferReply({ ephemeral: true });
            const attachment = await generateProfileCard(interaction.member);
            await interaction.editReply({ files: [attachment] });
        }

        if (interaction.customId === 'coins_buy_roles') {
            const member = interaction.member;
            const userCoins = db.coins.get(member.id) || 0;

            let currentTargetIndex = 0;
            for (let i = 0; i < ROLE_HIERARCHY.length; i++) {
                if (!member.roles.cache.has(ROLE_HIERARCHY[i])) {
                    currentTargetIndex = i;
                    break;
                }
                if (i === ROLE_HIERARCHY.length - 1) {
                    currentTargetIndex = ROLE_HIERARCHY.length;
                }
            }

            const selectMenuOptions = ROLE_HIERARCHY.map((roleId, index) => {
                const hasRole = member.roles.cache.has(roleId);
                let labelStatus = `رول رقم ${index + 1} (50 كوينز)`;
                if (hasRole) {
                    labelStatus = `[ممتلك] رول رقم ${index + 1}`;
                } else if (index > currentTargetIndex) {
                    labelStatus = `[مغلق بالترتيب] رول رقم ${index + 1}`;
                }

                return {
                    label: labelStatus.slice(0, 100),
                    value: roleId,
                    description: `تكلفة الشراء: 50 كوينز`,
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('role_purchase_menu')
                .setPlaceholder('اختر الرول المطلوب شراؤه بالترتيب...')
                .addOptions(selectMenuOptions.slice(0, 25));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
                content: `رصيدك الحالي: **${userCoins}** كوينز.\nملاحظة: يجب شراء الرولات بالترتيب التصاعدي وكل رول بـ 50 كوينز.`,
                components: [row],
                ephemeral: true
            });
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'role_purchase_menu') {
            const member = interaction.member;
            const selectedRoleId = interaction.values[0];
            const roleIndex = ROLE_HIERARCHY.indexOf(selectedRoleId);

            if (roleIndex === -1) return;

            for (let i = 0; i < roleIndex; i++) {
                if (!member.roles.cache.has(ROLE_HIERARCHY[i])) {
                    await interaction.reply({
                        content: 'عذراً، لا يمكنك شراء هذا الرول قبل شراء الرولات التي قبله بالترتيب!',
                        ephemeral: true
                    });
                    return;
                }
            }

            if (member.roles.cache.has(selectedRoleId)) {
                await interaction.reply({
                    content: 'أنت تمتلك هذا الرول بالفعل!',
                    ephemeral: true
                });
                return;
            }

            const userCoins = db.coins.get(member.id) || 0;
            const price = 50;

            if (userCoins < price) {
                await interaction.reply({
                    content: `رصيدك غير كافي! تحتاج إلى ${price} كوينز لشراء هذا الرول (رصيدك الحالي: ${userCoins} كوينز).`,
                    ephemeral: true
                });
                return;
            }

            try {
                db.coins.set(member.id, userCoins - price);
                const currentPurchases = db.purchases.get(member.id) || 0;
                db.purchases.set(member.id, currentPurchases + 1);

                await member.roles.add(selectedRoleId);

                await interaction.reply({
                    content: `تم شراء الرول بنجاح! تم خصم ${price} كوينز من رصيدك.`,
                    ephemeral: true
                });
            } catch (err) {
                console.error('Error assigning role:', err);
                await interaction.reply({
                    content: 'حدث خطأ أثناء محاولة إعطائك الرول، تأكد من صلاحيات البوت.',
                    ephemeral: true
                });
            }
        }
    }
});

client.login(process.env.TOKEN);
