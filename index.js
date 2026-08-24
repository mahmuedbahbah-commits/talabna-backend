const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.json());

// قاعدة بيانات مؤقتة في الذاكرة للغرف والطلبات النشطة
const activeRooms = {};

io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل:', socket.id);

  // 1. انضمام المستخدم لغرفة الطلب الجماعي
  socket.on('join_group_room', (roomId) => {
    socket.join(roomId);
    console.log(`انضم لغرفة الطلب الجماعي: ${roomId}`);

    if (activeRooms[roomId]) {
      socket.emit('sync_cart', activeRooms[roomId]);
    } else {
      activeRooms[roomId] = {
        items: [],
        subtotal: 0.0,
        isBatchActive: false,
        deliveryFee: 7.0
      };
    }
  });

  // 2. إضافة صنف للسلة المشتركة وتحديث المجموع لحظياً
  socket.on('add_item_to_group', ({ roomId, item }) => {
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = { items: [], subtotal: 0.0, isBatchActive: false, deliveryFee: 7.0 };
    }

    activeRooms[roomId].items.push(item);
    activeRooms[roomId].subtotal += item.price;

    // بث التحديث الفوري لكل الأصدقاء في نفس الغرفة
    io.to(roomId).emit('sync_cart', activeRooms[roomId]);
  });

  // 3. تفعيل أو إلغاء "التوصيل المجمع" وتعديل رسوم التوصيل فوراً
  socket.on('toggle_batch_delivery', ({ roomId, isActive }) => {
    if (activeRooms[roomId]) {
      activeRooms[roomId].isBatchActive = isActive;
      activeRooms[roomId].deliveryFee = isActive ? 3.5 : 7.0;

      io.to(roomId).emit('sync_cart', activeRooms[roomId]);
    }
  });

  // 4. تأكيد الطلب وإرساله لوحة تحكم المطعم
  socket.on('checkout_group_order', ({ roomId, restaurantId, orderDetails }) => {
    io.to(restaurantId).emit('new_restaurant_order', {
      roomId,
      items: orderDetails.items,
      isBatchActive: orderDetails.isBatchActive,
      total: orderDetails.total
    });
  });

  // انضمام المطعم لغرفته الخاصة
  socket.on('join_merchant_room', (restaurantId) => {
    socket.join(restaurantId);
    console.log(`المطعم متصل بغرفته الخاصة: ${restaurantId}`);
  });

  socket.on('disconnect', () => {
    console.log('انقطع اتصال المستخدم:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل بكفاءة على المنفذ: ${PORT}`);
});
