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

{"data":{"authResponse":"success authorization"},"status":200,"statusText":"OK","headers":{"content-length":"40","content-type":"application/json"},"config":{"transitional":{"silentJSONParsing":true,"forcedJSONParsing":true,"clarifyTimeoutError":false},"adapter":["xhr","http","fetch"],"transformRequest":[null],"transformResponse":[null],"timeout":5000,"xsrfCookieName":"XSRF-TOKEN","xsrfHeaderName":"X-XSRF-TOKEN","maxContentLength":-1,"maxBodyLength":-1,"env":{},"headers":{"Accept":"application/json, text/plain, */*","Content-Type":"application/json","Access-Token":"Bearer ya29.a0AeDClZBLdUbKM5778sHovifgAXkGdGFTkKUIdCzmfYemdgDvgpg8MFcfs5NNUi1t2RC3YI5AN3m2XWEGcWx_GJbRXbL0_Cl3uqZtmZDG97zVBdMfWn-OaIMGhT60jEu38g5Wr2QPsuobz30h2i5IEk4lLOzL0gSolzGJ2xgGaCgYKAcwSARESFQHGX2MiMe9tnU_8syJb8Z4zaxu4VA0175"},"baseURL":"http://localhost:3000","method":"get","url":"http://localhost:3000/test?request=testAuthFlow","params":{"email":"nurdworker%40gmail.com"}}},
