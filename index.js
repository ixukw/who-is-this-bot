// Construction
const Discord = require('discord.js');
const client = new Discord.Client();
const {prefix, token, user_id_len, pastebinKey} = require('./config.json');
const firebaseAdmin = require("firebase-admin");
const firebase = require("./who-is-this-bot-firebase-adminsdk-sy8hd-fd70878d2e.json");
const PastebinAPI = require('pastebin-js');
const pastebin = new PastebinAPI(pastebinKey);

// Firebase & Discord Initialization
firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(firebase)
});
const db = firebaseAdmin.firestore();
client.once('ready', () => {
	console.log('Ready.');
});
client.login(token);

client.on('message', message => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    const msgCh = message.channel;
    const args = message.content.slice(prefix.length).split(' ');
    if (args.length<1) return; // Filter out input "!" with no args.
    if (args.indexOf('')!=-1) return msgCh.send("Double space detected, please re-input with single space.");
    console.log(args);
    const input_id = parseMentionInput(args[1]);
    const guild_id = message.guild.id;
    
    if (input_id!="placeholder") {
        var username = message.guild.members.cache.get(input_id).user.username;
    }
    
    // Who Is This User Command
    if (args[0]==='whois') { 
        if (args.length<2) return msgCh.send("Invalid input.");
        checkServerExists(message, guild_id);
        console.log(`Searching for ${input_id} in server ${guild_id}.`);
        db.collection(guild_id).doc(input_id).get().then(function(doc) {
            if (doc.exists) {
                return message.reply(`\`${username}\` (\`${input_id}\`) is \`${doc.data().name}\`.`);
            } else {
                promptAddUser(message, input_id, guild_id, "placeholder", username);
            }
        }).catch((e) => { errorOutput(message, e); });

    // Update User Command
    } else if (args[0]==='update') { 
        if (args.length<3) return msgCh.send("Invalid input.");
        checkServerExists(message, guild_id);
        const name=parseName(args);
        db.collection(guild_id).doc(input_id).get().then(function (doc) {
            if (doc.exists) {
                var oldName = doc.data().name;
                db.collection(guild_id).doc(input_id).set({
                    name: name
                }, { merge: true }).catch((e) => { errorOutput(message, e); });
                return msgCh.send(`Name updated to \`${name}\` for user \`${username}\` (\`${input_id}\`). Previously: \`${oldName}\``);
            } else {
                promptAddUser(message, input_id, guild_id, name, username);
            }
        }).catch((e) => { errorOutput(message, e); });

    // Delete User Command
    } else if (args[0]==='delete') { 
        if (args.length<2) return msgCh.send("Invalid input.");
        const filter = m => m.author.id = message.author.id;
        msgCh.send(`Are you sure you wish to delete data for user \`${username}\` (\`${input_id}\`) in this particular server? Type \`${input_id}\` to confirm. (Timeout 30s)`).then(() => {
            msgCh.awaitMessages(filter, {max:1, time: 30000, errors: ['time']}).then(collected=>{
                db.collection(guild_id).doc(input_id).delete();
                return msgCh.send(`Deleted data for user \`${username}\` (\`${input_id}\`).`);
            }).catch((e) => { errorOutput(message, e); });
        });

    // Scan Server Command
    } else if (args[0]==='scan') { 
        msgCh.send("Scan Results:");
        var count=0;
        const allMembers = message.guild.members.fetch();
        var promises = [];
        allMembers.then(function(r) {
            setTimeout(()=> {
                r.forEach(function (obj) {
                    promises.push(obj.user.id);
                    /*db.collection(guild_id).doc(obj.user.id).get().then(function(doc){
                        if (!doc.exists) {
                            count++;
                            return `"${obj.user.username}" "${obj.user.id}" ""\n`;
                            //msgCh.send(`\`${count}\` . \`${obj.user.username}\` (\`${obj.user.id}\`) does not have an entry.`);
                        }
                    }).catch((e) => { errorOutput(message, e); });*/
                }, 5000);
            });
            
        });
        
        //pastebin.createPaste(output, `Unregistered for ${message.guild} (${message.guild.id}), enter names in last empty quote for each.`, null, 1, "N").then(function(d) {
        //    console.log(`Created paste with ID ${d}`);
        //    return message.channel.send(`Link: ${d}`);
        //}).catch((e)=>{ errorOutput(message, e); }); 
        console.log(promises);
               
    // Add User Command
    } else if (args[0]==='add') {
        if (args.length<3) return msgCh.send("Invalid Input.");
        addUser(message, parseMentionInput(args[1]), parseName(args), username);
        msgCh.send(`Added user \`${username}\` (\`${input_id}\`) with name \`${parseName(args)}\`.`);

    // Help Command
    } else if (args[0]==='help') { 
        return msgCh.send(
            "Commands:"+
            "\n**!whois [user id]** : requires a user id and returns the name of the user if it exists. Will prompt creation of user in database if such user does not exist. "+
            "\n**!help** : Displays this help menu."+
            "\n**!scan** : Scans the server for unregistered users. Note: User display order changes per use of this command."+
            "\n**!delete [user id]** : Deletes a specified user from the database."+
            "\n**!update [user id] [name]** : Updates a name for a specified user."+
            "\n**!add [user id] [name]** : Adds the specified user with specified name to the database for this particular server."+
            ""
        );
    }
});

// Adds a user without awaitReaction
function addUser(message, id, name, username) {
    console.log(`Creating entry for user ${username} (ID ${id}), name ${name}`);
    db.collection(message.guild.id).doc(id).set({
        name: name
    }, { merge: true });
    
}

// Outputs errors to the user.
function errorOutput(message, e) {
    console.log(e);
    return message.channel.send(`Error: \`${e}\``);
}

// Parses the name input.
function parseName(args) {
    var name = `${args[2]} `;
    for (var i=3; i<args.length; i++) {
        name+=`${args[i]} `;
    }
    return name.substring(0,name.length-1);
}

// Parses Mention/ID input.
function parseMentionInput(input) {
    if (input===undefined) return "placeholder";
    if (input.length==user_id_len) return input; // checks if input is in plain ID
    if (input.startsWith('<@') && input.endsWith('>')) { // checks if input is in mention form and parses it
        input = input.slice(2, -1);
        if (input.startsWith('!')) {
            input = input.slice(1);
        }
        return input;
    }
}

// Adds Reactions
function addReactions(msg) {
    msg.react('✅');
    msg.react('❌');
}

// Creates filter for reactions
function reactionFilter(message) {
    const filter = (reaction, user) => {
        return ['✅','❌'].includes(reaction.emoji.name)&&user.id === message.author.id;
    };
    return filter;
}

// Creates a new user entry in the database and prompts user.
function promptAddUser(message, add_id, server_id, name, username) {
    message.channel.send(`User not found. Create an entry for user \`${username}\` (\`${add_id}\`)? React Y/N. (Timeout 10s)`).then(function(msg) {
        addReactions(msg);
        const filter = reactionFilter(message);
        msg.awaitReactions(filter, {max: 1, time: 10000, errors: ['time']}).then(collected=>{
            const reaction = collected.first();
            if (reaction.emoji.name === '✅') {
                if (name==="placeholder") {
                    const filter = m => m.author.id = message.author.id;
                    message.channel.send("Enter the name for this user:").then(() => {
                        message.channel.awaitMessages(filter, {max:1, time: 30000, errors: ['time']}).then(collected=>{
                            console.log(`Creating entry for user ${add_id}, name ${collected.first()}`);
                            db.collection(server_id).doc(add_id).set({
                                name: collected.first().content 
                            }, { merge: true });
                            message.channel.send(`Added user \`${username}\` (\`${add_id}\`) to the database with name \`${collected.first().content}\`.`);
                        }).catch((e) => { errorOutput(message, e); });
                    });
                } else {
                    console.log(`Creating entry for user with id ${add_id}, name ${collected.first()}`);
                    db.collection(server_id).doc(add_id).set({
                        name: name 
                    }, { merge: true });
                    message.channel.send(`Added user \`${username}\` (\`${add_id}\`) to the database with name \`${name}\`.`);
                }
                
            } else return message.channel.send("Operation cancelled by user.");
        }).catch((e) => { errorOutput(message, e); });
    });
}

// Checks if the server exists in the database, if not prompts user to create an entry.
function checkServerExists(message, server_id) {
    db.collection(server_id).doc("placeholder").get().then(doc => {
        if (!doc.exists) {
            return message.channel.send(`Unrecognized Server. Create an entry for this server \`${message.guild}\` (\`${server_id}\`)? React Y/N with timeout 10s. \n**Please complete this step before adding users.**`).then(function(msg) {
                addReactions(msg);
                const filter = reactionFilter(message);
                msg.awaitReactions(filter, {max: 1, time: 10000, errors: ['time']}).then(collected=>{
                    const reaction = collected.first();
                    if (reaction.emoji.name === '✅') {
                        db.collection(server_id).doc("placeholder").set({
                            discord_id: "placeholder",
                            name: "placeholder"
                        });
                        message.channel.send(`Created entry for server \`${message.guild}\` with id \`${message.guild.id}\`.`);
                    } else return message.channel.send("Operation cancelled by user.");
                }).catch((e) => { errorOutput(message, e); });
            });
        } 
    }).catch((e) => { errorOutput(message, e); });
}