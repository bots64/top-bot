const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
const ANON_CHANNEL_ID = '1543113579962835054';
const EXCLUDED_ROLE_ID = '1535875661997277194';
const ADMIN_ROLE_ID = '1544487320357572629';

const db = {
    messages: new Map(),       
    words: new Map(),          
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    cooldowns: new Map(),
    bannedUsers: new Set()     
};

// تصفير البيانات كل 30 يوم (30 * 24 * 60 * 60 * 1000 ميللي ثانية)
const RESET_INTERVAL = 30 * 24 * 60 * 60 * 1000;
setInterval(() => {
    db.messages.clear();
    db.words.clear();
    db.voiceMinutes.clear();
    db.dailyMessages.clear();
    db.dailyVoice.clear();
    db.bannedUsers.clear();
    console.log('Leaderboards have been reset automatically for the 30-day cycle.');
}, RESET_INTERVAL);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    setInterval(updateLeaderboards, 30000);
});

// دالة التحقق من استبعاد العضو (إذا كان بوت، يمتلك الرول المستبعد، أو محظور من التوب عبر أمر leve)
function isExcluded(member) {
    if (!member) return true;
    if (member.user.bot) return true;
    if (member.roles.cache.has(EXCLUDED_ROLE_ID)) return true;
    if (db.bannedUsers.has(member.id)) return true;
    return false;
}

// تتبع الكلمات والرسائل العامة (كل رسالة = 1 نقطة للشات)
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // التعامل مع الأوامر الجديدة الخاصة بالرول الإداري
    if (message.content.startsWith('leve ') || message.content.startsWith('come ') || message.content.startsWith('اعطاء 1000 voice') || message.content.startsWith('اعطاء 1000 chat') || message.content.startsWith('سحب 1000 ')) {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return message.reply({ content: 'ليس لديك الصلاحية لاستخدام هذا الأمر.', ephemeral: true });
        }

        if (message.content.startsWith('leve ')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) return message.reply('يرجى منشن الشخص المراد إبعاده عن التوب.');
            
            db.bannedUsers.add(targetMember.id);
            await updateLeaderboards();
            return message.reply(`تم إبعاد العضو <@${targetMember.id}> من التوب نهائياً ولن يتم احتساب نقاطه.`);
        }

        if (message.content.startsWith('come ')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) return message.reply('يرجى منشن الشخص المراد إرجاعه للتوب.');
            
            db.bannedUsers.delete(targetMember.id);
            await updateLeaderboards();
            return message.reply(`تم إعادة العضو <@${targetMember.id}> للتوب بنجاح.`);
        }

        if (message.content.startsWith('اعطاء 1000 voice')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) return message.reply('يرجى منشن الشخص لإعطائه نقاط الفويس.');
            
            const currentVoice = db.voiceMinutes.get(targetMember.id) || 0;
            db.voiceMinutes.set(targetMember.id, currentVoice + 1000);
            await updateLeaderboards();
            return message.reply(`تم إعطاء العضو <@${targetMember.id}> مبلغ 1000 نقطة فويس بنجاح.`);
        }

        if (message.content.startsWith('اعطاء 1000 chat')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) return message.reply('يرجى منشن الشخص لإعطائه نقاط الشات.');
            
            const currentWords = db.words.get(targetMember.id) || 0;
            db.words.set(targetMember.id, currentWords + 1000);
            await updateLeaderboards();
            return message.reply(`تم إعطاء العضو <@${targetMember.id}> مبلغ 1000 نقطة شات بنجاح.`);
        }

        if (message.content.startsWith('سحب 1000 ')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) return message.reply('يرجى منشن الشخص لسحب النقاط منه.');
            
            const currentWords = db.words.get(targetMember.id) || 0;
            if (currentWords < 1000) {
                return message.reply('ليس معه نقاط كافية');
            }
            db.words.set(targetMember.id, currentWords - 1000);
            await updateLeaderboards();
            return message.reply(`تم سحب 1000 نقطة من العضو <@${targetMember.id}> بنجاح.`);
        }
    }

    if (isExcluded(message.member)) return;
    
    const userId = message.author.id;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + 1);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);
});

// تتبع الفويس (كل دقيقة يقعدها بالفويس تحسب 1 نقطة)
client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (isExcluded(member)) return;

    const targetVoiceId = '1543093370065260564';

    if (!oldState.channelId && newState.channelId === targetVoiceId) {
        member.voiceJoinTime = Date.now();
    } else if (oldState.channelId === targetVoiceId && !newState.channelId && member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
        const userId = member.id;
        
        const currentMins = db.voiceMinutes.get(userId) || 0;
        db.voiceMinutes.set(userId, currentMins + durationMins);

        const currentDailyMins = db.dailyVoice.get(userId) || 0;
        db.dailyVoice.set(userId, currentDailyMins + durationMins);
        
        member.voiceJoinTime = null;
    } else if (oldState.channelId === targetVoiceId && newState.channelId && newState.channelId !== targetVoiceId) {
        if (member.voiceJoinTime) {
            const durationMins = Math.floor((Date.now() - member.voiceJoinTime) / 60000);
            const userId = member.id;
            
            const currentMins = db.voiceMinutes.get(userId) || 0;
            db.voiceMinutes.set(userId, currentMins + durationMins);

            const currentDailyMins = db.dailyVoice.get(userId) || 0;
            db.dailyVoice.set(userId, currentDailyMins + durationMins);
            
            member.voiceJoinTime = null;
        }
    } else if (oldState.channelId !== targetVoiceId && newState.channelId === targetVoiceId) {
        member.voiceJoinTime = Date.now();
    }
});

async function updateLeaderboards() {
    try {
        // 1. تحديث توب الكلمات/الشات (يحتوي على زر My Stats فقط)
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

        // 2. تحديث توب الفويس
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

        // 3. رسالة "رسالة من مجهول" في القناة المخصصة
        const anonChannel = await client.channels.fetch(ANON_CHANNEL_ID).catch(() => null);
        if (anonChannel) {
            const messages = await anonChannel.messages.fetch({ limit: 5 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            if (!botMessage) {
                const embed = new EmbedBuilder()
                    .setColor('#1e1f22')
                    .setDescription('اكتب رسالتك بسرية تامة\nوكل شي محفوظ هنا');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
                );

                await anonChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error in updateLeaderboards:', err);
    }
}

function getTopMessagesText() {
    const sorted = [...db.words.entries()].filter(([userId]) => !db.bannedUsers.has(userId)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].filter(([userId]) => !db.bannedUsers.has(userId)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

// معالجة الأزرار
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'my_stats_txt') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            
            const allWords = db.words.get(userId) || 0;
            const msgToday = db.dailyMessages.get(userId) || 0;
            
            const sortedWords = [...db.words.entries()].filter(([id]) => !db.bannedUsers.has(id)).sort((a, b) => b[1] - a[1]);
            const rank = sortedWords.findIndex(item => item[0] === userId) + 1 || sortedWords.length + 1;

            const embed = new EmbedBuilder()
                .setTitle('My Message Stats')
                .setColor('#1e1f22')
                .setDescription(`all messages server ${allWords}\nmessages this day ${msgToday}\n#rank ${rank}`);

            await interaction.editReply({ embeds: [embed] });
        }

        // عند الضغط على زر رسالة من مجهول -> التحقق من الكولداون (5 دقائق)
        if (interaction.customId === 'anonymous_msg_btn') {
            const userId = interaction.user.id;
            const now = Date.now();
            const cooldownTime = 5 * 60 * 1000; 
            const lastTime = db.cooldowns.get(userId) || 0;

            if (now - lastTime < cooldownTime) {
                const expirationTimestamp = Math.floor((lastTime + cooldownTime) / 1000);
                await interaction.reply({
                    content: `لازم تنتظر <t:${expirationTimestamp}:R>`,
                    ephemeral: true
                });
                return;
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reveal_identity').setLabel('كشف الهوية').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('hide_identity').setLabel('إخفاء الهوية').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                components: [row],
                ephemeral: true
            });
        }

        // عند اختيار كشف أو إخفاء الهوية
        if (interaction.customId === 'reveal_identity' || interaction.customId === 'hide_identity') {
            const userId = interaction.user.id;
            db.cooldowns.set(userId, Date.now());

            const isReveal = interaction.customId === 'reveal_identity';

            await interaction.update({
                content: 'اكتب رسالتك مع المنشن',
                components: [],
                ephemeral: true
            });

            // فتح الشات لاستلام رسالة واحدة
            const filter = m => m.author.id === userId;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                try {
                    await m.delete().catch(() => {}); // حذف رسالة المستخدم فوراً
                } catch (err) {}

                // جلب جميع الأشخاص المنشنين
                const mentionedUsers = m.mentions.users;

                if (mentionedUsers.size === 0) {
                    await interaction.followUp({
                        content: 'ما في منشن',
                        ephemeral: true
                    });
                    return;
                }

                // تنظيف نص الرسالة: إزالة المنشنات لكي لا تظهر كروابط زرقاء مزعجة تحت كلمة "الرسالة :"
                let cleanContent = m.content;
                mentionedUsers.forEach(user => {
                    cleanContent = cleanContent.replace(new RegExp(`<@!?${user.id}>`, 'g'), '').trim();
                });

                // تحديد شكل اسم الراسل في الأسفل (بدون منشن تفاعلي أزرق، أو اسم صريح إذا كان كشف هوية)
                const senderMember = await m.guild.members.fetch(userId).catch(() => null);
                const senderName = senderMember ? senderMember.user.tag : 'مستخدم';
                const senderDisplay = isReveal ? senderName : 'مجهول الهويه';

                const sentTags = [];

                // إرسال الرسالة بالخاص لجميع المنشنين بالشكل المطلوب تماماً
                for (const [targetId, userObj] of mentionedUsers) {
                    if (userObj.bot) continue;

                    try {
                        await userObj.send(`عندك رسالة من مجهول\nالرسالة : ${cleanContent}\nالراسل : ${senderDisplay}`);
                        sentTags.push(`<@${targetId}>`);
                    } catch (err) {
                        console.log(`Could not send DM to ${userObj.tag}`);
                    }
                }

                if (sentTags.length === 0) {
                    await interaction.followUp({
                        content: 'ما في منشن',
                        ephemeral: true
                    });
                    return;
                }

                // إشعار المرسل بنجاح الإرسال
                await interaction.followUp({
                    content: `تم ارسال الرساله الى ${sentTags.join(', ')}`,
                    ephemeral: true
                });
            });
        }
    }
});

client.login(process.env.TOKEN);
