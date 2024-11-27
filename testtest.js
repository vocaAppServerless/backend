const axios = require("axios");
require("dotenv").config();

const client_id = process.env.OAUTH_CLIENT_ID;
const client_secret = process.env.OAUTH_CLIENT_SECRET;

const ac_token = "";
const verifyAccessToken = async (accessToken) => {
  try {
    const url = `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`;

    const response = await axios.get(url);
    return response.status; // access_token 정보 반환
  } catch (error) {
    console.error(`Error verifying access token:`, error.message);
    throw error;
  }
};

const func = async (ac_token) => {
  console.log(await verifyAccessToken(ac_token));
};
func(ac_token);
