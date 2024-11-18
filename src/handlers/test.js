exports.handler = async (event) => {
  // Example response
  const response = {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*", // 모든 출처 허용
      "Access-Control-Allow-Methods": "GET,OPTIONS", // 허용하는 메서드
      "Access-Control-Allow-Headers": "Content-Type", // 허용하는 헤더
    },
    body: JSON.stringify({ message: "hello from test lambda" }),
  };

  return response;
};
