const clients = new Set();

const addClient = (res) => {
  clients.add(res);
};

const removeClient = (res) => {
  clients.delete(res);
};

const send = (payload) => {
  // payload: { id: ..., data: {...} }
  
  // Chuẩn bị chuỗi dữ liệu theo đúng định dạng SSE
  let sseMessage = "";
  
  // 1. Gắn ID (Bắt buộc để lastEventId ở FE không bị rỗng)
  if (payload.id) {
    sseMessage += `id: ${payload.id}\n`;
  }

  // 2. Gắn Data
  const dataString = typeof payload.data === 'object'
    ? JSON.stringify(payload.data)
    : payload.data;
  sseMessage += `data: ${dataString}\n\n`;

  // 3. Gửi cho TẤT CẢ các client đang kết nối
  clients.forEach(client => {
    client.write(sseMessage);
  });
};

module.exports = {
  addClient,
  removeClient,
  send,
};