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

const getNewAccessTokenByRefreshToken = async (
  refreshToken,
  clientId,
  clientSecret
) => {
  const url = "https://oauth2.googleapis.com/token";

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", refreshToken);
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);

  try {
    const response = await axios.post(url, params);
    return response;
  } catch (error) {
    if (
      error.response &&
      error.response.data &&
      error.response.data.error === "invalid_grant"
    ) {
      console.error("Refresh token is invalid or expired");
    } else {
      console.error("Error refreshing access token:", error.message);
    }
    throw error;
  }
};

const func = async () => {
  const rf_token = "asd";
  console.log(
    await getNewAccessTokenByRefreshToken(rf_token, client_id, client_secret)
  );
};
func();
