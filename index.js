const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

let createCanvas, loadImage;
try {
    const canvasModule = require('@napi-rs/canvas');
    createCanvas = canvasModule.createCanvas;
    loadImage = canvasModule.loadImage;
} catch (e) {
    console.error('Canvas module failed to load:', e);
}

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
const ANONYMOUS_CHANNEL_ID = '1543113579962835054';
const EXCLUDED_ROLE_ID = '1535875661997277194';

const ROLE_HIERARCHY = [
    '1535522564061929512', '1535403948121395300', '1535724553563668561', '1535714669270925393',
    '1535714783259787366', '1535714856009732179', '1535714949085794456', '1535715039288496199',
    '1535715153885007912', '1535715241739026433', '1535715359477203014', '1535715454939824158',
    '1535715789187842258', '1535715700654604429', '1535715983405359144', '1535716064921653299',
    '1535716161197576212', '1535716253451288647', '1535716348947079322', '1535718216037568623',
    '1535718336585924608', '1535718418664136845', '1535718512683913276', '1535718767777030237',
    '1535718964683087963', '1535718917807538226', '1535718879911743619', '1535718823301480628',
    '1535719622400020722', '1535719580167831583', '1535719507727880273', '1535719311992164442',
    '1535719270250713161', '1535719233655275731', '1535719187861864569', '1535719144052232212',
    '1535720365127376897', '1535774790357614652', '1535843524371808306', '1535720318776123483',
    '1535720258655227966', '1535720208671440988', '1535720158092460052', '1535720065947668500',
    '1535720112542187560', '1535720023384002630', '1535719977351389304', '1535722770414051328',
    '1535722725706825889', '1535722681905979473', '1535722615925248151', '1535722539706220604',
    '1535722498933530674', '1535722454218178580', '1535722385175748669', '1535722345975775323',
    '1535722303550132284', '1535722243542360105', '1535722204627599391', '1535722173283573760',
    '1535723709929623675', '1535723664874676286', '1535723604078239784', '1535723556426481757',
    '1535723508389257397', '1535723441540567050', '1535723397231943832', '1535723352788836373',
    '1535723308539187352', '1535723262204452966', '1535723214679052288', '1535724212222959777',
    '1535724156791029801', '1535724113690099843', '1536989468492435496'
];

const db = {
    messages: new Map(),
    words: new Map(),
    voiceMinutes: new Map(),
    dailyMessages: new Map(),
    dailyVoice: new Map(),
    messageCounters: new Map(),
    coins: new Map(),
    purchases: new Map()
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    await setupAnonymousPanel();
    setInterval(updateLeaderboards, 30000);
});

function isExcluded(member) {
    if (!member) return true;
    if (member.user.bot) return true;
    if (member.roles.cache.has(EXCLUDED_ROLE_ID)) return true;
    return false;
}

// تتبع الرسائل والنقاط (كل 5 رسائل = 1 كوين) والأمر "نقاط"
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // روم رسالة من مجهول
    if (message.channel.id === ANONYMOUS_CHANNEL_ID && !message.system) {
        // يمكننا ترك الروم نظيفاً أو حذف رسائل المستخدم العادية لتظهر اللوحة فقط
    }

    if (isExcluded(message.member)) return;
    const userId = message.author.id;
    const content = message.content.trim();

    // أمر "نقاط" أو "نقاطي"
    if (content === 'نقاط' || content === 'نقاطي') {
        const attachment = await generateProfileCard(message.member);
        if (attachment) {
            await message.reply({ files: [attachment] }).catch(() => {});
        }
        return;
    }

    const wordCount = content.split(/\s+/).length;
    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);

    const currentMsgCount = (db.messageCounters.get(userId) || 0) + 1;
    if (currentMsgCount >= 5) {
        db.messageCounters.set(userId, 0);
        db.coins.set(userId, (db.coins.get(userId) || 0) + 1);
    } else {
        db.messageCounters.set(userId, currentMsgCount);
    }
});

// تتبع الفويس (كل دقيقة = نقطة صوتية)
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (isExcluded(member)) return;

    if (!oldState.channelId && newState.channelId) {
        member.voiceJoinTime = Date.now();
    } else if (oldState.channelId && !newState.channelId && member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
        if (durationMins > 0) {
            const userId = member.id;
            db.voiceMinutes.set(userId, (db.voiceMinutes.get(userId) || 0) + durationMins);
        }
        member.voiceJoinTime = null;
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (member.voiceJoinTime) {
            const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
            if (durationMins > 0) {
                const userId = member.id;
                db.voiceMinutes.set(userId, (db.voiceMinutes.get(userId) || 0) + durationMins);
            }
        }
        member.voiceJoinTime = Date.now();
    }
});

// تحديث التوب فويس والتوب رسائل
async function updateLeaderboards() {
    try {
        const vcChannel = await client.channels.fetch(VC_CHANNEL_ID).catch(() => null);
        if (vcChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated recently' });

            const messages = await vcChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await vcChannel.send({ embeds: [embed] });
        }

        const coinsPanelChannel = await client.channels.fetch(COINS_PANEL_CHANNEL_ID).catch(() => null);
        if (coinsPanelChannel) {
            const messages = await coinsPanelChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            const embed = new EmbedBuilder()
                .setTitle('Coins Panel')
                .setColor('#1e1f22')
                .setDescription('اضغط على الزر بالأسفل لعرض قائمة الرولات المتاحة للشراء.');

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

async function setupAnonymousPanel() {
    try {
        const anonChannel = await client.channels.fetch(ANONYMOUS_CHANNEL_ID).catch(() => null);
        if (anonChannel) {
            const messages = await anonChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;

            const embed = new EmbedBuilder()
                .setTitle('اكتب رسالتك بسرية تامة وكل شي محفوط هنا')
                .setColor('#1e1f22');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('send_anonymous_msg').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
            );

            if (botMessage) {
                await botMessage.edit({ embeds: [embed], components: [row] }).catch(() => {});
            } else {
                await anonChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error in setupAnonymousPanel:', err);
    }
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]} دقيقة`).join('\n');
}

// تصميم الكارت بالصورة المطلوبة (يوزر الشخص + رصيده + عدد الرولات المشتراة + أفتار الشخص)
async function generateProfileCard(member) {
    if (!createCanvas) return null;
    const canvas = createCanvas(700, 320);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#161917';
    ctx.beginPath();
    ctx.roundRect(0, 0, 700, 320, 24);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(member.user.username, 650, 65);

    ctx.strokeStyle = '#3e5c4a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(420, 85);
    ctx.lineTo(650, 85);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#8c9892';
    ctx.font = '20px sans-serif';
    ctx.fillText('الرصيد الحالي', 650, 130);

    const userCoins = db.coins.get(member.id) || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${userCoins} Coins`, 650, 170);

    ctx.fillStyle = '#8c9892';
    ctx.font = '20px sans-serif';
    ctx.fillText('إجمالي المشتريات', 650, 230);

    const totalPurchases = db.purchases.get(member.id) || 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`${totalPurchases} منتج`, 650, 270);

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

        ctx.strokeStyle = '#3e5c4a';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(120, 160, 80, 0, Math.PI * 2, true);
        ctx.stroke();
    } catch (e) {
        console.error('Error loading avatar:', e);
    }

    return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'profile-card.png' });
}

// بناء أزرار القائمة (أول 25 رول مع زر "المزيد" إذا تجاوزت)
function getRoleMenuComponents(page = 1, member) {
    const ITEMS_PER_PAGE = 24;
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageRoles = ROLE_HIERARCHY.slice(startIndex, endIndex);

    const buttons = pageRoles.map((roleId, idx) => {
        const absoluteIndex = startIndex + idx;
        const role = member.guild.roles.cache.get(roleId);
        const roleName = role ? role.name : `رول ${absoluteIndex + 1}`;
        
        return new ButtonBuilder()
            .setCustomId(`buy_role_${absoluteIndex}`)
            .setLabel(roleName.slice(0, 80))
            .setStyle(ButtonStyle.Secondary);
    });

    const actionRows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        actionRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    // زر المزيد إذا كان هناك المزيد من الرولات
    if (ROLE_HIERARCHY.length > endIndex) {
        const extraRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`roles_page_${page + 1}`)
                .setLabel('المزيد')
                .setStyle(ButtonStyle.Primary)
        );
        actionRows.push(extraRow);
    } else if (page > 1) {
        const extraRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`roles_page_${page - 1}`)
                .setLabel('الصفحة السابقة')
                .setStyle(ButtonStyle.Primary)
        );
        actionRows.push(extraRow);
    }

    return actionRows;
}

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        // رسالة من مجهول (فتح مودال للإرسال بالخاص)
        if (interaction.customId === 'send_anonymous_msg') {
            const modal = new ModalBuilder()
                .setCustomId('anonymous_modal')
                .setTitle('إرسال رسالة من مجهول');

            const textInput = new TextInputBuilder()
                .setCustomId('anonymous_text')
                .setLabel('اكتب رسالتك السرية هنا')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
            await interaction.showModal(modal);
            return;
        }

        // عرض قائمة الرولات
        if (interaction.customId === 'coins_buy_roles' || interaction.customId.startsWith('roles_page_')) {
            let page = 1;
            if (interaction.customId.startsWith('roles_page_')) {
                page = parseInt(interaction.customId.split('_')[2]);
            }

            const member = interaction.member;
            const components = getRoleMenuComponents(page, member);

            await interaction.reply({
                content: `اختر الرول المطلوب شراؤه (الصفحة ${page}):`,
                components: components,
                ephemeral: true
            });
            return;
        }

        // شراء رول معين عبر الزر
        if (interaction.customId.startsWith('buy_role_')) {
            const roleIndex = parseInt(interaction.customId.split('_')[2]);
            const selectedRoleId = ROLE_HIERARCHY[roleIndex];
            const member = interaction.member;

            // التحقق من الشراء بالترتيب
            for (let i = 0; i < roleIndex; i++) {
                if (!member.roles.cache.has(ROLE_HIERARCHY[i])) {
                    await interaction.reply({
                        content: 'عذراً، لا يمكنك شراء هذا الرول لأنك لم تشتري الرولات التي قبله بالترتيب!',
                        ephemeral: true
                    });
                    return;
                }
            }

            // التحقق إذا كان يمتلكه بالفعل
            if (member.roles.cache.has(selectedRoleId)) {
                await interaction.reply({
                    content: 'هذا الرول بالفعل عندك!',
                    ephemeral: true
                });
                return;
            }

            const userCoins = db.coins.get(member.id) || 0;
            const price = 50;

            if (userCoins < price) {
                await interaction.reply({
                    content: `رصيدك غير كافي! تحتاج إلى buy 50 coins (رصيدك الحالي: ${userCoins} كوينز).`,
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
                    content: 'تم شراء الرول بنجاح!',
                    ephemeral: true
                });
            } catch (err) {
                console.error('Error assigning role:', err);
                await interaction.reply({
                    content: 'حدث خطأ أثناء محاولة إعطائك الرول.',
                    ephemeral: true
                });
            }
            return;
        }
    }

    // استقبال المودال للرسالة السرية وإرسالها بالخاص
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'anonymous_modal') {
            const text = interaction.fields.getTextInputValue('anonymous_text');
            try {
                await interaction.user.send(`📩 **وصلتك رسالة جديدة من مجهول:**\n> ${text}`);
                await interaction.reply({ content: 'تم إرسال رسالتك بنجاح إلى الخاص!', ephemeral: true });
            } catch (e) {
                await interaction.reply({ content: 'عذراً، لم أستطيع إرسال الرسالة لك بالخاص، تأكد من فتح خاص البوت.', ephemeral: true });
            }
            return;
        }
    }
});

client.login(process.env.TOKEN);
