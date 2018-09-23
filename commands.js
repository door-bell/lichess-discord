const Discord = require('discord.js');
const axios = require('axios');
const countryFlags = require('emoji-flags');
const convertSeconds = require('convert-seconds')
// Set up UserSchema
var User = require('./userSchema').User;

var commands = {
    "setuser": {
    	usage: "<lichess name>",
    	description: "set your lichess username",
    	process: ( bot, msg, suffix ) => {
    		var authorId = msg.author.id;
    		var username = suffix;
    		User.findOne( { userId: authorId }, ( err, result ) => {
    			if ( err ) {
    				console.log( err );
    			}
    			if ( !result ) {
    				User.create({ userId: authorId, lichessName: username }, ( err, createResult ) => {
    					msg.channel.send("User added! " + msg.author.username + " = " + username);
    				});
    			}
    			else {
    				if ( ( new Date() - result.dateAdded ) < ( 60 * 60 * 1000 ) ) { // 1 hour
    					msg.channel.send("You may update your name once per hour. Try again later.");
    				}
    				else {
    					var newValues = { $set: { lichessName: username, dateAdded: new Date() } };
    					User.updateOne({ userId: authorId }, newValues, ( err, updateResult ) => {
    						msg.channel.send("User updated! " + msg.author.username + " is now lichess user " + username);
    					});
    				}
    			}
    		});
    	}
    },
    "whoami": {
        usage: "",
        description: "Returns your current lichess username",
        process: ( bot, msg ) => {
          User.findOne( { userId: msg.author.id }, ( err, result ) => {
    				if ( err ) {
    					console.log( err );
    				}
    				if ( !result ) {
    					msg.channel.send("No user found under that name!");
    				}
    				else {
    					msg.channel.send(msg.author.username + " is lichess user " + result.lichessName);
    				}
    			});
        }
    },
    "setgamemode": {
    	usage: "<game mode>",
    	description: "set your favorite game mode (puzzle for puzzle mode)",
    	process: ( bot, msg, suffix ) => {
    		var authorId = msg.author.id;
    		var mode = suffix;
    		User.findOne( { userId: authorId }, ( err, result ) => {
    			if ( err ) {
    				console.log( err );
    			}
    			if ( !result ) {
    				msg.channel.send("You need to set your lichess username with setuser!");
    			}
    			else {
    				var newValues = { $set: { favoriteMode: mode } };
    				User.updateOne({ userId: authorId }, newValues, ( err, updateResult ) => {
    					msg.channel.send(msg.author.username + " favorite mode updated!");
    				});
    			}
    		});
    	}
    },
    "summary": {
        usage: "[username]",
        description: "A summary of your profile or a given profile",
        process: ( bot, msg, suffix ) => {
        	if ( suffix ) {
        		sendSummary( msg, suffix, '' );
        	}
        	else {
        		User.findOne( { userId: msg.author.id }, ( err, result ) => {
    					if ( err ) {
    						console.log( err );
    					}
    					if ( !result ) {
    						msg.channel.send("You need to set your lichess username with setuser!");
    					}
    					else {
    						sendSummary( msg, result.lichessName, result.favoriteMode );
    					}
    			});
        	}
        }
    },
    "recent": {
        usage: "[rated/casual]",
        description: "share your most recent game",
        process: ( bot, msg, suffix ) => {
            var rated = "";
            // test if the user wants a rated, casual game, or most recent
            if (suffix.includes('casual') || suffix.includes('unrated')) {
                rated = "false";
            }
            else if (suffix.includes('rated')) {
                rated = "true";
            }
            else {
                rated = "";
            }
            User.findOne( { userId: msg.author.id }, ( err, result ) => {
                if ( err ) {
                    console.log( err );
                }
                if ( !result ) {
                    msg.channel.send("No user found under that name!");
                }
                else {
                    sendGame( msg, result.lichessName, rated );
                }
            });
        }
    },
    "playing": {
        usage: "[user]",
        description: "shares your ongoing game",
        process: ( bot, msg, suffix ) => {
            if ( suffix ) {
                sendCurrent( msg, suffix );
            }
            else {
                // Send name.
                User.findOne( { userId: msg.author.id }, ( err, result ) => {
                     if ( err ) {
                         console.log( err );
                     }
                     if ( !result ) {
                         msg.channel.send("You need to set your username first with `setuser`");
                     }
                     else {
                        sendCurrent( msg, result.lichessName );
                     }
                });
            }
        }
    },
}
// Send ongoin game info
function sendCurrent ( msg, username ) {
    axios.get( 'https://lichess.org/api/user/' + username )
    .then( ( response ) => {
        var formattedMessage = formatCurrent( response.data );
        msg.channel.send(formattedMessage);
    })
    .catch( ( err ) => {
        console.log(err);
        msg.channel.send("An error occured with that request!");
    });
}


// summary command
function sendSummary ( msg, username, favoriteMode ) {
	axios.get( 'https://lichess.org/api/user/' + username )
		.then( ( response ) => {
			var formattedMessage = formatSummary( response.data, favoriteMode );
			msg.channel.send(formattedMessage);
		})
		.catch( ( err ) => {
			console.log( "Error in sendSummary: " + username + " " + err.response.status + " " + err.response.statusText );
			msg.channel.send("An error occured with that request! " + err.response.status + " " + err.response.statusText );
		});
}
// Recent command
function sendGame ( msg, username, rated ) {
    // Accept only the x-ndjson type
    axios.get( 'https://lichess.org/games/export/' + username + "?max=1" + "&rated=" + rated,
        { headers: { 'Accept': 'application/x-ndjson' } } )
        .then( ( response ) => {
            var formattedMessage = formatGame( response.data );
            msg.channel.send(formattedMessage);
        })
        .catch( ( err ) => {
            console.log("error in sendGame");
            msg.channel.send("An error occured with that request!");
        });
}
// Format playing
function formatCurrent ( data ) {
    var formattedMessage;
    if ( data.playing ) {
        formattedMessage = data.playing;
    }
    else {
        formattedMessage = "No current games found!";
    }
    return formattedMessage;
}

// Returns a summary in discord markup of a user, returns nothing if error occurs.
function formatSummary ( data, favoriteMode ) {
  var colorEmoji;
  if (data.playing) {
    colorEmoji = data.playing.includes("white") ? "⚪" : "⚫";
  }
  var status = ( !data.online ? "🔴Offline" : ( colorEmoji ? colorEmoji + "Playing" : "✅Online" ) );

  var flag = "";
  if (data.profile.country)
    flag = ":flag_" + data.profile.country.toLowerCase() + ": ";

  var playerName = data.username;
  if (data.title)
      playerName = data.title + " " + playerName;

  var formattedMessage = new Discord.RichEmbed()
    .setAuthor(playerName, null, data.url)
    .setTitle("Challenge " + data.username + " to a game!")
    .setURL("https://lichess.org/?user=" + data.username + "#friend")
    .setColor(0xFFFFFF)
    .addField("Status", status, true)
    .addField("Rating", getHighestRating(data.perfs), true)
    .addField("Time Played", formatSeconds(data.playTime.total), true)
    .addField("Win Expectancy: ", getWinExpectancy(data), true)
    .addField("Games: ", data.count.rated + " rated, " + (data.count.all - data.count.rated) + " casual", true);

	return formattedMessage;
}
// Format game
function formatGame ( data ) {
    var formattedMessage, playerLine;
    var whiteRatingDiff = data.players.white.ratingDiff;
    var blackRatingDiff = data.players.black.ratingDiff;
    if ( whiteRatingDiff > 0 )
        whiteRatingDiff = " ▲" + whiteRatingDiff + "📈";
    else if ( whiteRatingDiff < 0 )
        whiteRatingDiff = " ▼" + Math.abs( whiteRatingDiff ) + "📉";
    else
        whiteRatingDiff = "";
    if ( blackRatingDiff > 0 )
        blackRatingDiff = " ▲" + blackRatingDiff + "📈";
    else if ( blackRatingDiff < 0 )
        blackRatingDiff = " ▼" + Math.abs( blackRatingDiff ) + "📉";
    else
        blackRatingDiff = "";

    formattedMessage =
        "https://lichess.org/" + data.id + "\n" +
        "```prolog\n" +
        data.players.white.user.name + " (" + data.players.white.rating + whiteRatingDiff + ")" +
        " vs " + data.players.black.user.name + " (" + data.players.black.rating + blackRatingDiff + ")\n" +
        "Winner: "+ data.winner + "\n" +
        "```";
    return formattedMessage;
}
// Get string with highest rating formatted for summary
function getHighestRating ( list ) {
    var modes = modesArray( list );

    var highestMode = modes[0][0];
    var highestRD = modes[0][1].rd;
    var highestRating = modes[0][1].rating;
    var highestGames = modes[0][1].games;
    for ( var i = 0; i < modes.length; i++ ) {
        if (modes[i][0] === "puzzle") continue; // Skip puzzle rating
        if ( modes[i][1].rating > highestRating) {
            highestMode = modes[i][0];
            highestRD = modes[i][1].rd;
            highestRating = modes[i][1].rating;
            highestGames = modes[i][1].games;
        }
    }

    var formattedMessage = highestRating + " ± " +
      ( 2 * highestRD ) + " " + highestMode + " over " + highestGames + " games";
	  return formattedMessage;
}
// For sorting through modes... lichess api does not put these in an array so we do it ourselves
function modesArray ( list ) {
    var array = [];
    // Count up number of keys...
    var count = 0;
        for(var key in list)
           if(list.hasOwnProperty(key))
                count++;
    // Set up the array.
    for ( var i = 0; i < count; i++ ) {
        array[i] = Object.entries(list)[i];
    }
    return array;
}
// Get win/result expectancy (draws count as 0.5)
function getWinExpectancy ( list ) {
    var score = list.count.win + ( list.count.draw / 2 );
	return ( score / list.count.all * 100 ).toFixed(1)+ "%";
}
function formatSeconds ( seconds ) {
  var duration = convertSeconds( seconds );
  duration.days = Math.floor(seconds / 60 / 60 / 24);
  duration.hours = duration.hours % 24;
  var message = duration.seconds + " seconds";
  if ( duration.minutes )
      message = duration.minutes + " minutes";
  if ( duration.hours )
      message = duration.hours + " hours, " + message;
  if ( duration.days )
      message = duration.days + " days, " + message;
  return message;
}

module.exports = {
	commands: commands
}
