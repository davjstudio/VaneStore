// --- CONFIGURACIÓN DE SEGURIDAD ---
if (sessionStorage.getItem('acceso_vane') !== 'autorizado') {
    window.location.href = 'pin.html';
}

function cerrarSesion() {
    sessionStorage.removeItem('acceso_vane');
    sessionStorage.clear();
    window.location.href = 'pin.html';
}

// --- CONFIGURACIÓN INICIAL ---
let productos = []; 
let carrito = [];
let todasLasVentas = []; 
let streamActual = null; 
let editandoID = null; 
let idParaEliminar = null; 
let accionPendiente = null; 

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
    document.getElementById('modal-mensaje').innerText = "¿Seguro(a) que quieres eliminar este producto?";
    document.getElementById('modal-confirmacion').style.display = 'flex';
}

function limpiarHistorialTotal() {
    accionPendiente = "historial";
    document.getElementById('modal-titulo').innerText = "¿Vaciar historial?";
    document.getElementById('modal-mensaje').innerText = "¿Seguro(a) que quieres borrar todo el registro de ventas? Esta acción es permanente.";
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

// --- RENDERIZADO TIENDA ---
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

// --- LÓGICA DE PAGO Y VUELTO ---
function calcularVuelto() {
    const totalText = document.getElementById('pos-total').innerText.replace('S/ ', '');
    const total = parseFloat(totalText) || 0;
    const pago = parseFloat(document.getElementById('pago-cliente').value) || 0;
    const vuelto = pago - total;
    
    document.getElementById('vuelto-cliente').innerText = `S/ ${Math.max(0, vuelto).toFixed(2)}`;
}

// --- CARRITO Y VENTAS ---
let productoSeleccionadoID = null;

function agregarCarrito(id) {
    const p = productos.find(x => x.id === id);
    if(p) {
        if(parseInt(p.stock) <= 0) return mostrarNotificacion("❌ Sin stock");
        
        productoSeleccionadoID = id;
        document.getElementById('cant-prod-nombre').innerText = p.nombre;
        document.getElementById('input-cantidad-manual').value = 1;
        
        document.getElementById('modal-cantidad').style.display = 'flex';
        
        setTimeout(() => {
            const input = document.getElementById('input-cantidad-manual');
            if(input){
                input.focus();
                input.select();
            }
        }, 100);
    }
}

function setCantPreset(valor) {
    document.getElementById('input-cantidad-manual').value = valor;
}

function cerrarModalCantidad() {
    document.getElementById('modal-cantidad').style.display = 'none';
    productoSeleccionadoID = null;
}

function confirmarAgregarCarrito() {
    const p = productos.find(x => x.id === productoSeleccionadoID);
    const inputVal = document.getElementById('input-cantidad-manual').value;
    const cantPedida = parseInt(inputVal) || 0;

    if (cantPedida <= 0) return mostrarNotificacion("❌ Ingresa una cantidad válida");

    const itemExistente = carrito.find(x => x.id === productoSeleccionadoID);
    const cantEnCarrito = itemExistente ? itemExistente.cant : 0;

    if ((cantEnCarrito + cantPedida) > parseInt(p.stock)) {
        return mostrarNotificacion(`⚠️ Solo quedan ${p.stock} en stock en total`);
    }

    if(itemExistente) {
        itemExistente.cant += cantPedida;
    } else {
        carrito.push({...p, cant: cantPedida});
    }

    renderBoleta();
    cerrarModalCantidad();
    mostrarNotificacion(`✅ ${cantPedida} x ${p.nombre} agregado`);
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
    carrito.forEach((i, index) => {
        const subtotal = i.precio * i.cant;
        total += subtotal;
        box.innerHTML += `
            <div class="item-boleta-linea" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-size: 0.85rem;">
                <div class="item-info" style="flex: 1;">
                    <span class="item-cant" style="font-weight: 800;">${i.cant}x</span>
                    <span class="item-nombre">${i.nombre}</span>
                </div>
                <div class="item-controles" style="display: flex; align-items: center; gap: 5px;">
                    <div class="precio-editable-container" style="display: flex; align-items: center; background: #f9f9f9; padding: 2px 5px; border-radius: 5px;">
                        <span style="font-size: 0.7rem;">S/</span>
                        <input type="number" 
                               class="input-precio-boleta" 
                               value="${i.precio.toFixed(2)}" 
                               step="0.10"
                               style="width: 50px; border: none; background: transparent; font-weight: bold; text-align: right; font-family: 'Poppins';"
                               onchange="modificarPrecioCarrito(${index}, this.value)">
                    </div>
                    <button class="btn-quitar-item" onclick="quitarUno('${i.id}')" style="background:none; border:none; cursor:pointer;">➖</button>
                </div>
            </div>`;
    });
    document.getElementById('pos-total').innerText = "S/ " + total.toFixed(2);
    calcularVuelto(); 
}

function modificarPrecioCarrito(index, nuevoPrecio) {
    const precioNum = parseFloat(nuevoPrecio);
    if (isNaN(precioNum) || precioNum < 0) {
        mostrarNotificacion("❌ Precio no válido");
        renderBoleta();
        return;
    }
    carrito[index].precio = precioNum;
    renderBoleta();
    mostrarNotificacion("💰 Precio ajustado");
}

function limpiarCarrito() {
    carrito = [];
    document.getElementById('pago-cliente').value = "";
    document.getElementById('vuelto-cliente').innerText = "S/ 0.00";
    renderBoleta();
    mostrarNotificacion("Carrito vaciado");
}

// --- GENERACIÓN DE PDF ---
async function bajarPDFBoleta(nombreArchivo) {
    const element = document.querySelector('.boleta-card');
    const opt = {
        margin: 0,
        filename: nombreArchivo + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true },
        jsPDF: { unit: 'mm', format: [75, 200], orientation: 'portrait' }
    };
    return html2pdf().set(opt).from(element).outputPdf('blob');
}

async function finalizarVenta() { 
    if(carrito.length > 0) { 
        const totalVenta = carrito.reduce((sum, item) => sum + (item.precio * item.cant), 0);
        const pagoCon = parseFloat(document.getElementById('pago-cliente').value) || totalVenta;
        const vueltoVal = pagoCon - totalVenta;
        
        const numTicket = "B001-" + Math.floor(Math.random() * 900000 + 100000);
        const ahora = new Date();
        const fechaTexto = ahora.toLocaleDateString() + ' ' + ahora.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

        const ventaData = {
            ticket: numTicket,
            fecha: fechaTexto,
            total: totalVenta,
            pagoCon: pagoCon,
            vuelto: Math.max(0, vueltoVal),
            cliente: document.getElementById('cliente-dni').value || "General",
            productos: carrito.map(i => `${i.cant}x ${i.nombre}`),
            detalleCarrito: JSON.parse(JSON.stringify(carrito)) 
        };
        
        db.ref('ventas').push(ventaData);

        carrito.forEach(item => {
            db.ref('productos/' + item.id).update({ stock: item.stock - item.cant });
        });
        
        document.getElementById('num-ticket').innerText = numTicket;
        document.getElementById('fecha-boleta').innerText = fechaTexto;
        
        const pdfBlob = await bajarPDFBoleta(numTicket);
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${numTicket}.pdf`;
        link.click();

        window.print(); 
        
        carrito = []; 
        document.getElementById('pago-cliente').value = "";
        document.getElementById('vuelto-cliente').innerText = "S/ 0.00";
        document.getElementById('cliente-dni').value = "";
        renderBoleta(); 
        mostrarNotificacion("✅ Venta y PDF generados");
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

// --- HISTORIAL ---
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
            lista.innerHTML += `<div class="separador-fecha" style="background: #e2e2e2; padding: 5px; margin: 10px 0; font-weight: bold; border-radius: 5px; text-align: center;">📅 VENTAS DEL ${fechaActual}</div>`;
        }
        acumulado += v.total;
        lista.innerHTML += `
            <div class="linea-historial" style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 10px 0;">
                <div>
                    <strong style="color: #5352ed;">${v.ticket}</strong> <small>(${v.fecha.split(' ')[1]})</small><br>
                    <small>${v.productos.join(', ')}</small><br>
                    <small style="color: #666;">Pago: S/ ${v.pagoCon?.toFixed(2) || v.total.toFixed(2)} | Vuelto: S/ ${v.vuelto?.toFixed(2) || '0.00'}</small>
                </div>
                <div style="text-align: right;">
                    <span style="font-weight: bold; color: #2ed573;">S/ ${v.total.toFixed(2)}</span><br>
                    <button onclick="reimprimirTicket('${v.id}')" style="border:none; background:none; cursor:pointer; font-size:12px; color:#5352ed;">📄 PDF/REIMP</button>
                </div>
            </div>`;
    });
    
    if(displayTotal) displayTotal.innerText = `Total Seleccionado: S/ ${acumulado.toFixed(2)}`;
}

// --- DESCARGA GLOBAL ZIP ---
async function descargarTodoPDF() {
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

    if (filtradas.length === 0) return mostrarNotificacion("No hay boletas para descargar");

    mostrarNotificacion("⚙️ Generando ZIP, espera...");
    const zip = new JSZip();

    for (let v of filtradas) {
        document.getElementById('num-ticket').innerText = v.ticket;
        document.getElementById('fecha-boleta').innerText = v.fecha;
        document.getElementById('pos-total').innerText = "S/ " + v.total.toFixed(2);
        document.getElementById('pago-cliente').value = v.pagoCon;
        document.getElementById('vuelto-cliente').innerText = "S/ " + (v.vuelto ? v.vuelto.toFixed(2) : "0.00");
        document.getElementById('cliente-dni').value = v.cliente;

        const box = document.getElementById('carrito-items');
        box.innerHTML = "";
        if(v.detalleCarrito) {
            v.detalleCarrito.forEach(i => {
                box.innerHTML += `
                    <div class="item-boleta-linea" style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                        <span>${i.cant}x ${i.nombre}</span>
                        <span>S/ ${i.precio.toFixed(2)}</span>
                    </div>`;
            });
        } else {
            v.productos.forEach(p => {
                box.innerHTML += `<div class="item-boleta-linea" style="font-size: 0.85rem;">${p}</div>`;
            });
        }

        const pdfBlob = await bajarPDFBoleta(v.ticket);
        zip.file(`${v.ticket}.pdf`, pdfBlob);
    }

    const content = await zip.generateAsync({type:"blob"});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `Boletas_VaneStore_${new Date().toISOString().slice(0,10)}.zip`;
    link.click();
    mostrarNotificacion("✅ ZIP Descargado");
    
    limpiarCarrito();
}

function reimprimirTicket(id) {
    const v = todasLasVentas.find(x => x.id === id);
    if(v) {
        document.getElementById('num-ticket').innerText = v.ticket;
        document.getElementById('fecha-boleta').innerText = v.fecha;
        document.getElementById('pos-total').innerText = "S/ " + v.total.toFixed(2);
        document.getElementById('vuelto-cliente').innerText = "S/ " + (v.vuelto ? v.vuelto.toFixed(2) : "0.00");
        document.getElementById('cliente-dni').value = v.cliente;
        document.getElementById('pago-cliente').value = v.pagoCon || v.total;
        
        const box = document.getElementById('carrito-items');
        box.innerHTML = "";
        
        if(v.detalleCarrito) {
            v.detalleCarrito.forEach(i => {
                box.innerHTML += `
                    <div class="item-boleta-linea" style="display: flex; justify-content: space-between; font-size: 0.85rem;">
                        <span>${i.cant}x ${i.nombre}</span>
                        <span>S/ ${i.precio.toFixed(2)}</span>
                    </div>`;
            });
        } else {
            v.productos.forEach(prodStr => {
                box.innerHTML += `<div class="item-boleta-linea" style="font-size: 0.85rem;">${prodStr}</div>`;
            });
        }
        
        window.print();
    }
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
        "Cliente": v.cliente || "General",
        "Productos": v.productos.join(' | '),
        "Total (S/)": v.total,
        "Pagó con (S/)": v.pagoCon || v.total,
        "Vuelto (S/)": v.vuelto || 0
    }));

    const hoja = XLSX.utils.json_to_sheet(datosExcel);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
    XLSX.writeFile(libro, `Reporte_VaneStore_${new Date().toISOString().slice(0,10)}.xlsx`);
    mostrarNotificacion("📊 Excel generado");
}

document.addEventListener('DOMContentLoaded', () => {
    const inputCant = document.getElementById('input-cantidad-manual');
    if(inputCant) {
        inputCant.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                confirmarAgregarCarrito();
            }
        });
    }
});