// --- CONFIGURACIÓN INICIAL ---
let productos = []; 
let carrito = [];
let streamActual = null; 
let editandoID = null; 
let idParaEliminar = null; // Variable para el Modal de eliminación

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const imgPreview = document.getElementById('img-preview');

// --- 1. SINCRONIZACIÓN EN TIEMPO REAL (FIREBASE) ---
db.ref('productos').on('value', (snapshot) => {
    const data = snapshot.val();
    productos = [];
    
    if (data) {
        Object.keys(data).forEach(key => {
            productos.push({
                id: key, 
                ...data[key]
            });
        });
    }
    renderTienda(); 
});

// --- NOTIFICACIONES ELEGANTES ---
function mostrarNotificacion(mensaje) {
    const toast = document.createElement('div');
    toast.className = 'toast-vane'; 
    toast.innerHTML = `<span>✨</span> ${mensaje}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// --- CÁMARA ---
async function iniciarCamara() {
    try {
        streamActual = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = streamActual;
        video.style.display = "block";
        imgPreview.style.display = "none";
        const wrapper = document.getElementById('wrapper-preview');
        if(wrapper) wrapper.style.display = "none";
    } catch (err) { 
        console.log("Cámara no disponible"); 
    }
}

function tomarFoto() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    imgPreview.src = canvas.toDataURL('image/png');
    imgPreview.style.display = "block";
    video.style.display = "none";
    const wrapper = document.getElementById('wrapper-preview');
    if(wrapper) wrapper.style.display = "block";
}

function cargarImagenDesdeArchivo(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imgPreview.src = e.target.result; 
            imgPreview.style.display = "block";
            video.style.display = "none"; 
            const wrapper = document.getElementById('wrapper-preview');
            if(wrapper) wrapper.style.display = "block";
        }
        reader.readAsDataURL(file);
    }
}

function borrarFotoActual() {
    imgPreview.src = "";
    imgPreview.style.display = "none";
    const wrapper = document.getElementById('wrapper-preview');
    if(wrapper) wrapper.style.display = "none";
    document.getElementById('file-input').value = "";
    video.style.display = "block";
}

// --- 2. GUARDAR Y EDITAR (FIREBASE) ---
function guardarLocal() {
    const p = {
        codigo: document.getElementById('prod-codigo').value,
        nombre: document.getElementById('prod-nombre').value,
        precio: parseFloat(document.getElementById('prod-precio').value),
        stock: parseInt(document.getElementById('prod-stock').value) || 0,
        foto: imgPreview.src 
    };

    if(!p.nombre || isNaN(p.precio) || !p.foto || imgPreview.src === "") {
        return mostrarNotificacion("Faltan datos o la foto");
    }

    if (editandoID) {
        db.ref('productos/' + editandoID).set(p)
            .then(() => {
                mostrarNotificacion("✅ Producto actualizado con éxito");
                limpiarFormularioRegistro();
                mostrarSeccion('pos');
            });
    } else {
        db.ref('productos').push(p)
            .then(() => {
                mostrarNotificacion("☁️ Guardado en la nube correctamente");
                limpiarFormularioRegistro();
                mostrarSeccion('pos');
            });
    }
}

function limpiarFormularioRegistro() {
    editandoID = null;
    document.getElementById('prod-codigo').value = "";
    document.getElementById('prod-nombre').value = "";
    document.getElementById('prod-precio').value = "";
    document.getElementById('prod-stock').value = "";
    borrarFotoActual();
    document.querySelector('.btn-guardar-prod').innerText = "GUARDAR EN INVENTARIO";
}

function prepararEdicion(id, event) {
    event.stopPropagation();
    const p = productos.find(prod => prod.id === id);
    if(!p) return;

    editandoID = id;
    mostrarSeccion('registro'); 

    document.getElementById('prod-codigo').value = p.codigo;
    document.getElementById('prod-nombre').value = p.nombre;
    document.getElementById('prod-precio').value = p.precio;
    document.getElementById('prod-stock').value = p.stock;
    
    imgPreview.src = p.foto;
    imgPreview.style.display = "block";
    video.style.display = "none";
    document.getElementById('wrapper-preview').style.display = "block";
    
    document.querySelector('.btn-guardar-prod').innerText = "ACTUALIZAR PRODUCTO";
}

// --- NUEVA LÓGICA DE ELIMINACIÓN CON MODAL ---
function eliminarProducto(id, event) {
    event.stopPropagation();
    idParaEliminar = id; // Guardamos el ID del producto que queremos borrar
    document.getElementById('modal-confirmacion').style.display = 'flex'; // Mostramos el modal elegante
}

function cerrarModal() {
    document.getElementById('modal-confirmacion').style.display = 'none';
    idParaEliminar = null;
}

// Configurar el botón de "SÍ, ELIMINAR" del modal
document.getElementById('btn-confirmar-borrar').onclick = function() {
    if (idParaEliminar) {
        db.ref('productos/' + idParaEliminar).remove()
            .then(() => {
                mostrarNotificacion("🗑️ Producto eliminado correctamente");
                cerrarModal();
            })
            .catch((error) => {
                mostrarNotificacion("❌ Error al eliminar");
                console.error(error);
                cerrarModal();
            });
    }
};

function renderTienda() {
    const grid = document.getElementById('grid-productos');
    if(!grid) return;
    grid.innerHTML = "";
    productos.forEach(p => {
        const stockColor = p.stock <= 5 ? 'red' : '#666';

        grid.innerHTML += `
            <div class="card-producto" onclick="agregarCarrito('${p.id}')">
                <div class="admin-btns">
                    <button onclick="prepararEdicion('${p.id}', event)" class="btn-edit-prod">✏️</button>
                    <button onclick="eliminarProducto('${p.id}', event)" class="btn-delete-prod">🗑️</button>
                </div>
                <img src="${p.foto}">
                <h4>${p.nombre}</h4>
                <p>S/ ${p.precio.toFixed(2)}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                    <small style="color: #999;">${p.codigo}</small>
                    <small style="background: #f1f2f6; padding: 2px 8px; border-radius: 10px; font-weight: bold; color: ${stockColor};">
                        Stock: ${p.stock}
                    </small>
                </div>
            </div>`;
    });
}

// --- NAVEGACIÓN Y CARRITO ---
function mostrarSeccion(id) {
    document.getElementById('sec-pos').style.display = (id === 'pos') ? 'flex' : 'none';
    document.getElementById('sec-registro').style.display = (id === 'registro') ? 'flex' : 'none';
    if(id === 'registro' && !editandoID) iniciarCamara();
    if(id === 'pos') { 
        editandoID = null; 
        document.querySelector('.btn-guardar-prod').innerText = "GUARDAR EN INVENTARIO";
        renderTienda(); 
    }
}

function agregarCarrito(id) {
    const p = productos.find(x => x.id === id);
    if(p) {
        if(parseInt(p.stock) <= 0) {
            return mostrarNotificacion("❌ ¡AGOTADO! No queda stock de este producto.");
        }
        
        const item = carrito.find(x => x.id === id);
        if(item) {
            if(item.cant < parseInt(p.stock)) {
                item.cant++;
            } else {
                return mostrarNotificacion("⚠️ Límite de stock alcanzado");
            }
        } else {
            carrito.push({...p, cant: 1});
        }
        renderBoleta();
    }
}

function quitarUno(id) {
    const itemIndex = carrito.findIndex(x => x.id === id);
    if (itemIndex !== -1) {
        carrito[itemIndex].cant--;
        if (carrito[itemIndex].cant <= 0) {
            carrito.splice(itemIndex, 1); 
        }
        renderBoleta();
    }
}

function renderBoleta() {
    const box = document.getElementById('carrito-items');
    let total = 0; 
    box.innerHTML = "";
    
    carrito.forEach(i => {
        total += i.precio * i.cant;
        box.innerHTML += `
            <div class="item-boleta-linea">
                <div class="item-info">
                    <span class="item-cant">${i.cant}x</span>
                    <span class="item-nombre">${i.nombre}</span>
                </div>
                <div class="item-controles">
                    <span class="item-subtotal">S/ ${(i.precio * i.cant).toFixed(2)}</span>
                    <button class="btn-quitar-item" onclick="quitarUno('${i.id}')">➖</button>
                </div>
            </div>`;
    });

    document.getElementById('pos-total').innerText = "S/ " + total.toFixed(2);
}

function limpiarCarrito() {
    carrito = [];
    renderBoleta();
    mostrarNotificacion("Carrito vaciado");
}

// --- FINALIZAR VENTA CON DESCUENTO DE STOCK ---
function finalizarVenta() { 
    if(carrito.length > 0) { 
        carrito.forEach(item => {
            const nuevoStock = item.stock - item.cant;
            db.ref('productos/' + item.id).update({ stock: nuevoStock });
        });

        const numTicket = "B001-" + Math.floor(Math.random() * 900000 + 100000);
        const ahora = new Date();
        const fechaTexto = ahora.toLocaleDateString() + ' ' + ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const campoVendedor = document.getElementById('vendedor-nombre'); 
        if(campoVendedor) campoVendedor.value = "Personal";

        document.getElementById('num-ticket').innerText = numTicket;
        document.getElementById('fecha-boleta').innerText = fechaTexto;

        window.print(); 
        carrito = []; 
        renderBoleta(); 
        mostrarNotificacion("Venta procesada y stock actualizado");
    } else {
        mostrarNotificacion("El carrito está vacío");
    }
}

function filtrarPOS(val) {
    const q = val.toLowerCase();
    
    const exacto = productos.find(p => p.codigo === val);
    if(exacto) { 
        if(parseInt(exacto.stock) <= 0) {
            mostrarNotificacion("❌ Código detectado pero el producto está AGOTADO");
            document.getElementById('pos-search').value = ""; 
            return; 
        }
        
        agregarCarrito(exacto.id); 
        document.getElementById('pos-search').value = ""; 
        mostrarNotificacion("Producto agregado por código");
    }

    document.querySelectorAll('.card-producto').forEach(c => {
        c.style.display = c.innerText.toLowerCase().includes(q) ? "block" : "none";
    });
}