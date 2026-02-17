// --- CONFIGURACIÓN INICIAL ---
let productos = []; 
let carrito = [];
let todasLasVentas = []; 
let streamActual = null; 
let editandoID = null; 
let idParaEliminar = null; 
let accionPendiente = null; // Nueva: para saber qué hace el modal

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const imgPreview = document.getElementById('img-preview');

// --- 1. SINCRONIZACIÓN EN TIEMPO REAL (FIREBASE) ---
db.ref('productos').on('value', (snapshot) => {
    const data = snapshot.val();
    productos = [];
    if (data) {
        Object.keys(data).forEach(key => {
            productos.push({ id: key, ...data[key] });
        });
    }
    renderTienda(); 
});

// --- NOTIFICACIONES ---
function mostrarNotificacion(mensaje) {
    const toast = document.createElement('div');
    toast.className = 'toast-vane'; 
    toast.innerHTML = `<span>✨</span> ${mensaje}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

// --- CÁMARA Y FOTOS ---
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
    } catch (err) { console.log("Cámara no disponible"); }
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

// --- 2. GUARDAR Y EDITAR ---
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
                mostrarNotificacion("✅ Producto actualizado");
                limpiarFormularioRegistro();
                mostrarSeccion('pos');
            });
    } else {
        db.ref('productos').push(p)
            .then(() => {
                mostrarNotificacion("☁️ Guardado en la nube");
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
    const btn = document.querySelector('.btn-guardar-prod');
    if(btn) btn.innerText = "GUARDAR EN INVENTARIO";
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

// --- MODAL DE CONFIRMACIÓN ÚNICO ---
function eliminarProducto(id, event) {
    event.stopPropagation();
    idParaEliminar = id;
    accionPendiente = "producto";
    document.getElementById('modal-titulo').innerText = "¿Eliminar producto?";
    document.getElementById('modal-mensaje').innerText = "¿Segura que quieres eliminar este producto de TODAS las PC?";
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function limpiarHistorialTotal() {
    accionPendiente = "historial";
    document.getElementById('modal-titulo').innerText = "¿Vaciar historial?";
    document.getElementById('modal-mensaje').innerText = "¿Segura que quieres borrar todo el registro de ventas? Esta acción es permanente.";
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-confirmacion').style.display = 'none';
    idParaEliminar = null;
    accionPendiente = null;
}

document.getElementById('btn-confirmar-accion').onclick = function() {
    if (accionPendiente === "producto" && idParaEliminar) {
        db.ref('productos/' + idParaEliminar).remove()
            .then(() => {
                mostrarNotificacion("🗑️ Producto eliminado");
                cerrarModal();
            });
    } else if (accionPendiente === "historial") {
        db.ref('ventas').remove()
            .then(() => {
                mostrarNotificacion("🗑️ Historial vaciado");
                cerrarModal();
            });
    }
};

// --- RENDERIZADO ---
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

function mostrarSeccion(id) {
    document.getElementById('sec-pos').style.display = (id === 'pos') ? 'flex' : 'none';
    document.getElementById('sec-registro').style.display = (id === 'registro') ? 'flex' : 'none';
    document.getElementById('sec-historial').style.display = (id === 'historial') ? 'flex' : 'none';
    
    if(id === 'registro' && !editandoID) {
        iniciarCamara();
    } else if (streamActual) {
        streamActual.getTracks().forEach(track => track.stop());
    }

    if(id === 'pos') { 
        editandoID = null; 
        limpiarFormularioRegistro();
        renderTienda(); 
        document.getElementById('pos-search').focus();
    }
}

// --- CARRITO Y VENTAS ---
function agregarCarrito(id) {
    const p = productos.find(x => x.id === id);
    if(p) {
        if(parseInt(p.stock) <= 0) return mostrarNotificacion("❌ Sin stock");
        const item = carrito.find(x => x.id === id);
        if(item) {
            if(item.cant < parseInt(p.stock)) item.cant++;
            else return mostrarNotificacion("⚠️ Límite de stock");
        } else {
            carrito.push({...p, cant: 1});
        }
        renderBoleta();
    }
}

function quitarUno(id) {
    const idx = carrito.findIndex(x => x.id === id);
    if (idx !== -1) {
        carrito[idx].cant--;
        if (carrito[idx].cant <= 0) carrito.splice(idx, 1); 
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

function finalizarVenta() { 
    if(carrito.length > 0) { 
        const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cant), 0);
        const numTicket = "B001-" + Math.floor(Math.random() * 900000 + 100000);
        const ahora = new Date();
        const fechaTexto = ahora.toLocaleDateString() + ' ' + ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const ventaData = {
            ticket: numTicket,
            fecha: fechaTexto,
            total: totalVenta,
            productos: carrito.map(i => `${i.cant}x ${i.nombre}`)
        };
        db.ref('ventas').push(ventaData);

        carrito.forEach(item => {
            db.ref('productos/' + item.id).update({ stock: item.stock - item.cant });
        });
        
        document.getElementById('num-ticket').innerText = numTicket;
        document.getElementById('fecha-boleta').innerText = fechaTexto;
        window.print(); 
        carrito = []; 
        renderBoleta(); 
        mostrarNotificacion("✅ Venta registrada");
    } else {
        mostrarNotificacion("El carrito está vacío");
    }
}

function filtrarPOS(val) {
    const q = val.toLowerCase();
    const exacto = productos.find(p => p.codigo === val);
    if(exacto) { 
        if(parseInt(exacto.stock) <= 0) {
            mostrarNotificacion("❌ AGOTADO");
            document.getElementById('pos-search').value = ""; 
            return; 
        }
        agregarCarrito(exacto.id); 
        document.getElementById('pos-search').value = ""; 
        return;
    }
    document.querySelectorAll('.card-producto').forEach(c => {
        c.style.display = c.innerText.toLowerCase().includes(q) ? "block" : "none";
    });
}

// --- HISTORIAL Y EXCEL ---
db.ref('ventas').on('value', (snapshot) => {
    const ventas = snapshot.val();
    todasLasVentas = [];
    if (ventas) {
        Object.keys(ventas).forEach(key => {
            todasLasVentas.push({ id: key, ...ventas[key] });
        });
    }
    renderHistorialFiltrado();
});

function renderHistorialFiltrado() {
    const lista = document.getElementById('lista-ventas');
    const displayTotal = document.getElementById('total-dia');
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;

    if(!lista) return;
    lista.innerHTML = "";
    let acumulado = 0;

    let ventasFiltradas = todasLasVentas.filter(v => {
        if (!fDesde && !fHasta) return true;
        const partes = v.fecha.split(' ')[0].split('/'); 
        const fechaVenta = new Date(partes[2], partes[1] - 1, partes[0]);
        const desde = fDesde ? new Date(fDesde + "T00:00:00") : null;
        const hasta = fHasta ? new Date(fHasta + "T23:59:59") : null;
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
    });

    ventasFiltradas.sort((a, b) => b.ticket.localeCompare(a.ticket));

    let fechaActual = "";
    ventasFiltradas.forEach(v => {
        const fechaDia = v.fecha.split(' ')[0];
        if (fechaDia !== fechaActual) {
            fechaActual = fechaDia;
            lista.innerHTML += `<div class="separador-fecha">📅 VENTAS DEL ${fechaActual}</div>`;
        }
        acumulado += v.total;
        lista.innerHTML += `
            <div class="linea-historial">
                <div>
                    <strong style="color: #5352ed;">${v.ticket}</strong> <small>(${v.fecha.split(' ')[1]})</small><br>
                    <small>${v.productos.join(', ')}</small>
                </div>
                <span style="font-weight: bold; color: #2ed573;">S/ ${v.total.toFixed(2)}</span>
            </div>`;
    });
    
    if(displayTotal) displayTotal.innerText = `Total Seleccionado: S/ ${acumulado.toFixed(2)}`;
}

function exportarExcel() {
    if (todasLasVentas.length === 0) return mostrarNotificacion("No hay datos");
    const fDesde = document.getElementById('filtro-desde').value;
    const fHasta = document.getElementById('filtro-hasta').value;

    let filtradas = todasLasVentas.filter(v => {
        if (!fDesde && !fHasta) return true;
        const partes = v.fecha.split(' ')[0].split('/'); 
        const fechaVenta = new Date(partes[2], partes[1] - 1, partes[0]);
        const desde = fDesde ? new Date(fDesde + "T00:00:00") : null;
        const hasta = fHasta ? new Date(fHasta + "T23:59:59") : null;
        return (!desde || fechaVenta >= desde) && (!hasta || fechaVenta <= hasta);
    });

    const datosExcel = filtradas.map(v => ({
        "Ticket": v.ticket,
        "Fecha y Hora": v.fecha,
        "Productos": v.productos.join(' | '),
        "Total (S/)": v.total
    }));

    const hoja = XLSX.utils.json_to_sheet(datosExcel);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
    XLSX.writeFile(libro, `Reporte_VaneStore_${new Date().toISOString().slice(0,10)}.xlsx`);
    mostrarNotificacion("📊 Excel generado");
}