// Pestañas accesibles (patrón WAI-ARIA "tabs"): cada botón role="tab" apunta con aria-controls al panel que muestra.
// Se maneja con el teclado: flechas, Inicio y Fin cambian de pestaña.

// Pestaña a la que se pasa al pulsar una tecla (con vuelta al otro extremo), o null si la tecla no cambia de pestaña.
export function siguienteIndice(total, actual, tecla) {
  if (total === 0) return null;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (actual + 1) % total;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (actual - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

// "lista" es el elemento role="tablist" que contiene los botones. alCambiar recibe el id de la pestaña mostrada
// (se llama cuando el panel ya es visible, para poder medirlo, por ejemplo con un mapa).
export function crearPestanas(lista, alCambiar = () => {}) {
  const botones = [...lista.querySelectorAll('[role="tab"]')];
  const panelDe = (boton) => document.getElementById(boton.getAttribute('aria-controls'));
  const visibles = () => botones.filter((boton) => !boton.hidden);

  function mostrar(id, { foco = false } = {}) {
    for (const boton of botones) {
      const activo = boton.id === id;
      boton.setAttribute('aria-selected', String(activo));
      boton.tabIndex = activo ? 0 : -1;
      panelDe(boton).hidden = !activo;
    }
    if (foco) document.getElementById(id).focus();
    alCambiar(id);
  }

  // Muestra u oculta el botón de una pestaña (por ejemplo, "Detalle" solo existe con un reporte elegido).
  function mostrarPestana(id, visible) {
    document.getElementById(id).hidden = !visible;
  }

  lista.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[role="tab"]');
    if (boton && !boton.hidden) mostrar(boton.id);
  });

  lista.addEventListener('keydown', (evento) => {
    const boton = evento.target.closest('[role="tab"]');
    if (!boton) return;
    const activas = visibles();
    const siguiente = siguienteIndice(activas.length, activas.indexOf(boton), evento.key);
    if (siguiente === null) return;
    evento.preventDefault();
    mostrar(activas[siguiente].id, { foco: true });
  });

  return { mostrar, mostrarPestana };
}
