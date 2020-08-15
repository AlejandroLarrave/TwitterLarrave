const bcrypt = require("bcrypt");
const User = require("../models/user.model");
const Tweet = require("../models/tweet.model");
const Like = require("../models/likes.model");
const Reply = require("../models/replyTweet.model");
const Retweet = require("../models/ReTweet.model");
const jwt = require("../services/jwt");
const { getAction } = require("twitter-command");

async function v1(req, res) {
  try {
    res.send(await accion(req.user, getAction(req)));
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Error en el servidor" });
  }
}

async function accion(user, { command, args }) {
  try {
    if (command === "invalid command") return { message: "Comando Invalido" };
    else if (args === "invalid arguments")
      return { message: "Argumentos del comando invalidos, pon corchetes :)" };
    else {
      switch (command.toLowerCase()) {
        case "register":
          return await register(args);
          break;
        case "login":
          return await login(args);
          break;
        case "add_tweet":
          return await AgregarTweet(user, args);
          break;
        case "edit_tweet":
          return await UpdateAndDelete(user, args, 0);
          break;
        case "delete_tweet":
          return await UpdateAndDelete(user, args, 1);
          break;
        case "view_tweets":
          return await viewTweets(args);
          break;
        case "follow":
          return await followUser(user, args);
          break;
        case "unfollow":
          return await unfollowUser(user, args);
          break;
        case "profile":
          return await viewProfile(args);
          break;
        case "like_tweet":
          return await like(user, args);
          break;
        case "dislike_tweet":
          return await like(user, args);
          break;
        case "reply_tweet":
          return await reply(user, args);
          break;
        case "retweet":
          return await retweet(user, args);
          break;
        case "view_tweets":
          return await listTweets(args);
          break;
        default:
          return { message: "Comando invalido" };
        
      }
    }
  } catch (err) {
    console.log(err);
    return err;
  }
}

async function register(args) {
  const user = User();
  try {
    let userExists = await User.findOne({
      $or: [{ email: args[1] }, { username: args[2] }],
    });
    if (userExists) return { message: "El usuario ya existe, prueba con otro" };
    else {
      user.name = args[0];
      user.email = args[1];
      user.username = args[2];
      const password = await generatePassword(args[3]);
      if (!password) return { message: "Error con la contraseña" };
      else {
        user.password = password;
        let accountCreated = await user.save();
        if (!accountCreated)
          return { message: "Error al crear cuenta, intentalo más tarde" };
        else {
          return accountCreated;
        }
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
}

async function login(args) {
  try {
    const userFound = await User.findOne({
      $or: [{ username: args[0] }, { email: args[0] }],
    });

    if (!userFound) return { message: "Nombre de usuario o email incorrecto" };
    else {
      const correctPassword = await bcrypt.compare(args[1], userFound.password);
      if (!correctPassword) return { message: "Contraseña incorrecta" };
      else {
        return { token: jwt.createToken(userFound) };
      }
    }
  } catch (err) {
    return { message: "Error general" };
    console.log(err);
  }
}

const AgregarTweet = async (user, args) => {
  try {
    let newTweet = new Tweet();
    let like = new Like();
    newTweet.creator = user.sub;
    newTweet.date = new Date();
    newTweet.content = args[0];

    const reactionSaved = await like.save();
    if (!reactionSaved) {
      return {
        message: "ERROR NO SE PUEDEN GUARDAR LOS LIKES",
      };
    } else {
      newTweet.likes = reactionSaved._id;
      const newTweetAdded = await (await newTweet.save())
        .populate("creator", "-password -following -followers -name -email")
        .populate("likes", "-_id -interactors")
        .execPopulate();
      if (!newTweetAdded) return { message: "ERROR AL AGREGAR EL TWEET" };
      else {
        return newTweetAdded;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "ERROR EN EL SERVIDOR" };
  }
};

async function UpdateAndDelete(user, args, operation) {
  try {
    let resultTweet;
    let tweetFound;
    if (operation === 0) tweetFound = await Tweet.findById(args[1]);
    else tweetFound = await Tweet.findById(args[0]);

    if (!tweetFound)
      return {
        message:
          "El tweet con ese id no existe, comprueba que los datos son correctos",
      };
    else {
      if (String(user.sub) !== String(tweetFound.creator)) {
        return { message: "No tienes permisos para actuar sobre el tweet" };
      } else {
        if (operation === 0) {
          resultTweet = await Tweet.findByIdAndUpdate(
            args[1],
            { content: args[0] },
            { new: true }
          );
        } else {
          resultTweet = await Tweet.findByIdAndRemove(args[0]);
        }
        if (!resultTweet)
          return {
            message: "Ha ocurrido un error, intentalo de nuevo más tarde",
          };
        else {
          if (operation === 0) return resultTweet;
          else return { message: "Tweet Eliminado :)" };
        }
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Pon corchetes en el nuevo Tweet" };
  }
}

async function viewTweets(args) {
  try {
    if (args[0] === "*") {
      const allTweets = await Tweet.find({})
        .populate("creator", "-password -following -followers -name -email")
        .populate("likes", "-_id -interactors")
        .populate("replies", "-_id");
      if (!allTweets) return { message: "Unable to get tweets" };
      else return allTweets;
    } else {
      const userFound = await User.findOne({ username: args[0] });
      if (!userFound)
        return { message: "The user with that username doesn't exist" };
      else {
        const tweets = await Tweet.find({ creator: userFound._id })
          .populate("creator", "username")
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ])
          .populate([
            {
              path: "retweets",
              select: "-_id",
              populate: {
                path: "creator",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        if (!tweets) return { message: "Unable to get tweets" };
        else if (tweets.length === 0)
          return { message: `${userFound.username} doesn't have tweets yet.` };
        else return tweets;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Internal server Error" };
  }
};

async function followUser(user, args) {
  try {
    const toFollow = await User.findOne({ username: args[0] });
    if (!toFollow)
      return { message: "El usuario con este nombre no existe, verificalo" };
    else {
      const alreadyFollowed = await User.findOne({
        $and: [{ _id: user.sub }, { following: { _id: toFollow._id } }],
      });
      if (alreadyFollowed)
        return { message: `Ya sigues a ${toFollow.username}` };
      else {
        const addFollowing = await User.findByIdAndUpdate(
          user.sub,
          { $push: { following: toFollow } },
          { new: true }
        ).populate("following", "-password -following -followers -name -email");
        const addFollower = await User.findByIdAndUpdate(toFollow._id, {
          $push: { followers: user.sub },
        });
        if (addFollowing && addFollower) {
          return addFollowing;
        } else {
          return { message: `No se ha podido seguir a ${toFollow.username}` };
        }
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
}

async function unfollowUser(user, args) {
  try {
    const toUnFollow = await User.findOne({ username: args[0] });
    if (!toUnFollow)
      return {
        message: "El usuario con este nombre no existe, verificalo por favor.",
      };
    else {
      const following = await User.findOne({
        $and: [{ _id: user.sub }, { following: { _id: toUnFollow._id } }],
      });
      if (!following) return { message: `No sigues a ${toUnFollow.username}` };
      else {
        const stopFollowing = await User.findByIdAndUpdate(
          user.sub,
          { $pull: { following: toUnFollow._id } },
          { new: true }
        )
          .populate("following", "-following -password -followers -name -email")
          .select("username");

        const removeFollower = await User.findByIdAndUpdate(toUnFollow._id, {
          $pull: { followers: user.sub },
        });

        if (stopFollowing && removeFollower) {
          return stopFollowing;
        } else {
          return {
            message: `No se ha podido dejar de seguir a ${toUnFollow.username}`,
          };
        }
      }
    }
  } catch (err) {
    console.log(typeof err);
    return { message: "Error general" };
  }
}

async function generatePassword(password) {
  return await new Promise((res, rej) => {
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) rej(err);
      res(hash);
    });
  });
}

async function viewProfile(args) {
  try {
    const profile = await User.findOne({ username: args[0] })
    .select("username _id")
      .populate("following", "-name -email -password -following -followers")
      .populate("followers", "-name -email -password -following -followers");

    console.log(profile);
    if (!profile) return { message: "Perfil no encontrado" };
    else return profile;
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
}

async function doLike(id, userId) {
  try {
    const liked = await Like.findOneAndUpdate(
      { _id: id },
      { $push: { interactors: userId }, $inc: { likes: 1 } }
    );
    if (!liked) return { message: "Hubo un error con tu reacción, intenta más tarde" };
    else return { message: "Ahora te gusta este Tweet :)" };
  } catch (err) {
    console.log(err);



    return { message: "Error general" };
  }
};

async function dislike (id, userId) {
  try {
    const disliked = await Like.findOneAndUpdate(
      { _id: id },
      { $pull: { interactors: userId }, $inc: { likes: -1 } }
    );
    if (!disliked) return { message: "Ha ocurrido un error al querer eliminar tu like, intenta más tarde" };
    else return { message: "Ya no te gusta este Tweet :D" };
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
};

async function like (user, args) {
  try {
    const tweet = await Tweet.findById(args[0]);
    if (!tweet) return { message: "El Tweet que buscas no existe, verificalo :)" };
    else {
      const previusReactions = await Like.findOne({
        $and: [{ _id: tweet.likes }, { interactors: { _id: user.sub } }],
      });
      if (!previusReactions) {
        const toLike = await Like.findById(tweet.likes);        
        return await doLike(toLike._id, user.sub);
      } else return await dislike(previusReactions._id, user.sub);
    }
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
};

async function reply (user, args) {
  try {
    const newReply = new Reply();
    const tweetFound = await Tweet.findById(args[1]);
    if (!tweetFound) return { message: "El Tweet que buscas no existe, verificalo :)" };
    else {
      newReply.author = user.sub;
      newReply.content = args[0];
      const newReplyAdded = await newReply.save();
      if (!newReplyAdded)
        return { message: "Ha ocurrido un error, no se guardo tu respuesta :(" };
      else {
        const addReply = await Tweet.findByIdAndUpdate(
          tweetFound._id,
          {
            $push: { replies: newReplyAdded._id },
          },
          { new: true }
        )
          .populate(
            "creator",
            "-_id -password -following -followers -name -email"
          )
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        return !addReply
          ? { message: "No se ha podido responder al Tweet" }
          : addReply;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
};

async function retweet (user, args) {
  try {
    const tweetExists = await Tweet.findById(args[1]);
    if (!tweetExists) return { message: "El Tweet que buscas no existe, verificalo :)" };
    else {
      const newRetweet = new Retweet();
      newRetweet.creator = user.sub;

      if (args[0] !== "") newRetweet.title = args[0];

      const retweetAdded = await newRetweet.save();
      if (!retweetAdded) return { message: "Ha ocurrido un error, no se puedo guardar el Tweet" };
      else {
        const updateTweet = await Tweet.findByIdAndUpdate(
          tweetExists._id,
          {
            $push: { retweets: retweetAdded._id },
          },
          { new: true }
        )
          .populate("creator", "username")
          .populate("likes", "-_id -interactors")
          .populate([
            {
              path: "replies",
              select: "-_id",
              populate: {
                path: "author",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ])
          .populate([
            {
              path: "retweets",
              select: "-_id",
              populate: {
                path: "creator",
                select: "-_id -password -following -followers -name -email",
              },
            },
          ]);

        return !updateTweet
          ? { message: "Ha ocurrido un error, no se pudo hacer ReTweet" }
          : updateTweet;
      }
    }
  } catch (err) {
    console.log(err);
    return { message: "Error general" };
  }
};

module.exports = {
  v1,
};
