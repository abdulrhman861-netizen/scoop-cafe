import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function StaffDashboard() {
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' or 'inventory'

  // تشغيل صوت التنبيه للطلبات الجديدة
  const playAlertSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(e => console.log('Audio autoplay blocked:', e));
  };

  useEffect(() => {
    fetchOrders();
    fetchProducts();

    // الاشتراك في التحديثات الفورية للطلبات (Realtime)
    const subscription = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        playAlertSound();
        setOrders(prev => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products').select('*');
    if (data) setProducts(data);
  }

  // تحديث حالة الطلب (جديد -> قيد التحضير -> جاهز)
  const updateOrderStatus = async (orderId, newStatus) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    if (!error) {
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    }
  };

  // تغيير حالة توفر المنتج (متوفر / نافذ)
  const toggleProductAvailability = async (productId, currentStatus) => {
    const { error } = await supabase
      .from('products')
      .update({ is_available: !currentStatus })
      .eq('id', productId);

    if (!error) {
      setProducts(products.map(p => p.id === productId ? { ...p, is_available: !currentStatus } : p));
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 font-sans dir-rtl text-right">
      {/* Header Panel */}
      <div className="bg-amber-900 text-white p-4 rounded-xl flex justify-between items-center mb-6 shadow-md">
        <div>
          <h1 className="text-xl font-bold">شاشة الكادر الكاشير - سكوب كوفي</h1>
          <p className="text-xs text-amber-200">الجامعة العراقية - مجمع سبع أبكار</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setActiveTab('orders')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'orders' ? 'bg-amber-700 text-white' : 'bg-amber-950 text-amber-200'}`}
          >
            الطلبات الحالية 📥
          </button>
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`px-4 py-2 rounded-lg text-sm font-bold ${activeTab === 'inventory' ? 'bg-amber-700 text-white' : 'bg-amber-950 text-amber-200'}`}
          >
            إدارة المنيو والنفاذ ☕
          </button>
        </div>
      </div>

      {/* Tab 1: Orders Management */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map(order => (
            <div 
              key={order.id} 
              className={`bg-white rounded-xl p-4 shadow-sm border-2 ${
                order.status === 'new' ? 'border-red-500 bg-red-50/20' : 
                order.status === 'preparing' ? 'border-yellow-500' : 
                order.status === 'ready' ? 'border-green-500 bg-green-50/20' : 'border-gray-200'
              }`}
            >
              <div className="flex justify-between items-center border-b pb-2 mb-2">
                <span className="text-2xl font-extrabold text-amber-900">#{order.order_number}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${
                  order.order_type === 'delivery' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {order.order_type === 'delivery' ? `توصيل: ${order.delivery_location}` : 'استلام مباشر'}
                </span>
              </div>

              {/* Order Items */}
              <div className="space-y-2 mb-4">
                {order.items && order.items.map((item, idx) => (
                  <div key={idx} className="text-sm bg-gray-50 p-2 rounded border">
                    <p className="font-bold text-gray-800">{item.product.name}</p>
                    {item.options && item.options.length > 0 && (
                      <p className="text-xs text-amber-800">
                        + {item.options.map(o => o.name).join(', ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center border-t pt-2 mb-3">
                <span className="text-xs text-gray-500">المبلغ الإجمالي:</span>
                <span className="font-bold text-amber-900">{order.total_amount} د.ع</span>
              </div>

              {/* Status Action Buttons */}
              <div className="flex gap-2">
                {order.status === 'new' && (
                  <button 
                    onClick={() => updateOrderStatus(order.id, 'preparing')} 
                    className="w-full bg-yellow-500 text-white font-bold py-2 rounded-lg text-sm"
                  >
                    بدء التحضير ⏳
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button 
                    onClick={() => updateOrderStatus(order.id, 'ready')} 
                    className="w-full bg-green-600 text-white font-bold py-2 rounded-lg text-sm"
                  >
                    نداء: الطلب جاهز 🔔
                  </button>
                )}
                {order.status === 'ready' && (
                  <button 
                    onClick={() => updateOrderStatus(order.id, 'completed')} 
                    className="w-full bg-gray-700 text-white font-bold py-2 rounded-lg text-sm"
                  >
                    تم التسليم ✓
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 2: Inventory & Out of Stock Options */}
      {activeTab === 'inventory' && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-bold mb-4 text-gray-800">التحكم بتوفر المنتجات في المنيو</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {products.map(product => (
              <div key={product.id} className="flex justify-between items-center p-3 border rounded-xl bg-gray-50">
                <div>
                  <h4 className="font-bold text-sm">{product.name}</h4>
                  <p className="text-xs text-gray-500">{product.price} د.ع</p>
                </div>
                <button 
                  onClick={() => toggleProductAvailability(product.id, product.is_available)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    product.is_available ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-green-100 text-green-700 border border-green-300'
                  }`}
                >
                  {product.is_available ? 'تعيين كـ (نافذ)' : 'إعادة للتوفير'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}