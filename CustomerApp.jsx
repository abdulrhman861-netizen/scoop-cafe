import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function CustomerApp() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [orderType, setOrderType] = useState('pickup'); // pickup or delivery
  const [locationDetails, setLocationDetails] = useState('');
  const [orderSuccess, setOrderSuccess] = useState(null);

  // جلب الأقسام والمنتجات عند تحميل الصفحة
  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: catData } = await supabase.from('categories').select('*');
    const { data: prodData } = await supabase.from('products').select('*, product_options(*)');
    if (catData) setCategories(catData);
    if (prodData) setProducts(prodData);
  }

  // إضافة عنصر للسلة
  const addToCart = () => {
    if (!selectedProduct) return;
    
    const extraPrice = selectedOptions.reduce((sum, opt) => sum + Number(opt.additional_price), 0);
    const itemTotal = Number(selectedProduct.price) + extraPrice;

    const cartItem = {
      product: selectedProduct,
      options: selectedOptions,
      totalPrice: itemTotal
    };

    setCart([...cart, cartItem]);
    setSelectedProduct(null);
    setSelectedOptions([]);
  };

  // إرسال الطلب إلى Supabase
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const grandTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
    const orderNumber = Math.floor(1000 + Math.random() * 9000); // رقم طلب عشوائي من 4 أرقام

    const { data, error } = await supabase.from('orders').insert([
      {
        order_number: orderNumber,
        order_type: orderType,
        delivery_location: orderType === 'delivery' ? locationDetails : 'استلام من الكشك',
        total_amount: grandTotal,
        payment_method: 'cash_on_delivery',
        status: 'new',
        items: cart
      }
    ]).select();

    if (!error && data) {
      setOrderSuccess(data[0]);
      setCart([]);
    } else {
      alert('حدث خطأ أثناء إرسال الطلب، حاول مجدداً.');
    }
  };

  const grandTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen pb-24 font-sans dir-rtl text-right">
      {/* Header */}
      <div className="bg-amber-900 text-white p-4 rounded-b-2xl shadow-md flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">سكوب كوفي | SCOOP Cafe</h1>
          <p className="text-xs text-amber-200">الجامعة العراقية - مجمع سبع أبكار</p>
        </div>
        <a href="https://instagram.com" target="_blank" rel="noreferrer" className="text-xs bg-amber-800 px-3 py-1 rounded-full border border-amber-700">
          إنستغرام 📸
        </a>
      </div>

      {/* Categories */}
      <div className="flex gap-2 p-4 overflow-x-auto">
        <button 
          onClick={() => setSelectedCategory('ALL')} 
          className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${selectedCategory === 'ALL' ? 'bg-amber-800 text-white' : 'bg-white text-gray-700 shadow-sm'}`}
        >
          الكل
        </button>
        {categories.map(cat => (
          <button 
            key={cat.id} 
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap ${selectedCategory === cat.id ? 'bg-amber-800 text-white' : 'bg-white text-gray-700 shadow-sm'}`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 gap-3 px-4">
        {products
          .filter(p => selectedCategory === 'ALL' || p.category_id === selectedCategory)
          .map(product => (
            <div 
              key={product.id} 
              onClick={() => product.is_available && setSelectedProduct(product)}
              className={`bg-white rounded-xl p-3 shadow-sm flex flex-col justify-between border ${!product.is_available ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-amber-500'}`}
            >
              <img src={product.image_url || 'https://via.placeholder.com/150'} alt={product.name} className="h-28 w-full object-cover rounded-lg mb-2" />
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{product.name}</h3>
                <p className="text-amber-800 font-bold text-xs mt-1">{product.price} د.ع</p>
              </div>
              {!product.is_available && (
                <span className="text-xs bg-gray-800 text-white text-center py-1 rounded mt-2">نافذ حالياً</span>
              )}
            </div>
          ))}
      </div>

      {/* Selected Item Modal (Options/Modifiers) */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-t-2xl p-5 animate-slide-up">
            <h2 className="text-lg font-bold mb-2">{selectedProduct.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{selectedProduct.description}</p>
            
            {/* Options */}
            {selectedProduct.product_options && selectedProduct.product_options.length > 0 && (
              <div className="mb-4">
                <h4 className="font-bold text-xs text-gray-400 mb-2">الإضافات والخيارات</h4>
                {selectedProduct.product_options.map(opt => (
                  <label key={opt.id} className="flex justify-between items-center p-2 border rounded-lg mb-2 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        onChange={(e) => {
                          if (e.target.checked) setSelectedOptions([...selectedOptions, opt]);
                          else setSelectedOptions(selectedOptions.filter(o => o.id !== opt.id));
                        }}
                      />
                      <span className="text-sm">{opt.name}</span>
                    </div>
                    {opt.additional_price > 0 && (
                      <span className="text-xs text-amber-800 font-bold">+{opt.additional_price} د.ع</span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={addToCart} className="flex-1 bg-amber-800 text-white py-3 rounded-xl font-bold">
                إضافة للسلة
              </button>
              <button onClick={() => setSelectedProduct(null)} className="bg-gray-200 px-4 rounded-xl font-bold">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Bottom Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t p-4 shadow-lg z-40">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-xs text-gray-500">إجمالي المجموع ({cart.length} عناصر)</span>
              <p className="text-lg font-bold text-amber-900">{grandTotal} د.ع</p>
            </div>
            <div className="flex gap-2 text-xs">
              <button 
                onClick={() => setOrderType('pickup')} 
                className={`px-3 py-1.5 rounded-lg border ${orderType === 'pickup' ? 'bg-amber-800 text-white' : 'bg-gray-100'}`}
              >
                استلام
              </button>
              <button 
                onClick={() => setOrderType('delivery')} 
                className={`px-3 py-1.5 rounded-lg border ${orderType === 'delivery' ? 'bg-amber-800 text-white' : 'bg-gray-100'}`}
              >
                توصيل بالكلية
              </button>
            </div>
          </div>

          {orderType === 'delivery' && (
            <input 
              type="text" 
              placeholder="اكتب اسم القاعة أو القسم داخل المجمع..." 
              value={locationDetails}
              onChange={(e) => setLocationDetails(e.target.value)}
              className="w-full p-2 border rounded-lg text-sm mb-3"
            />
          )}

          <button onClick={handleCheckout} className="w-full bg-green-600 text-white font-bold py-3 rounded-xl shadow-md">
            تأكيد الطلب (الدفع عند الاستلام)
          </button>
        </div>
      )}

      {/* Order Created Success Dialog */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 text-center max-w-xs w-full">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl font-bold">
              ✓
            </div>
            <h3 className="text-lg font-bold text-gray-800">تم إرسال طلبك بنجاح!</h3>
            <p className="text-gray-500 text-sm mt-1">رقم طلبك هو:</p>
            <div className="text-3xl font-extrabold text-amber-800 my-3">#{orderSuccess.order_number}</div>
            <p className="text-xs text-gray-400 mb-4">يرجى الاحتفاظ برقم الطلب لمتابعة النداء.</p>
            <button onClick={() => setOrderSuccess(null)} className="w-full bg-amber-800 text-white py-2 rounded-xl font-bold">
              حسناً
            </button>
          </div>
        </div>
      )}
    </div>
  );
}