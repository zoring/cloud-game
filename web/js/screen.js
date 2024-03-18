import {
    pub,
    sub,
    KB_MOUSE_FLAG,
    MOUSE_MOVED,
    MOUSE_PRESSED,
    SETTINGS_CHANGED,
    KBM_SKIP,
} from 'event';
import {browser, env} from 'env';
import {pointer, keyboard, retropad} from 'input';
import {opts, settings} from 'settings';

const rootEl = document.getElementById('screen')

const state = {
    kbmSkip: false,
    kbmSupport: false,
    components: [],
    current: undefined,
    forceFullscreen: false,
    showCursor: false,
}

const toggle = async (component, force) => {
    component && (state.current = component) // keep the last component
    state.components.forEach(c => c.toggle(false))
    state.current?.toggle(force)
    component && !env.isMobileDevice && !state.current?.noFullscreen && state.forceFullscreen && fullscreen()
    state.showCursor && await switchKeyboardMouse(true)
}

const init = () => {
    state.forceFullscreen = settings.loadOr(opts.FORCE_FULLSCREEN, false)
    sub(SETTINGS_CHANGED, () => {
        state.forceFullscreen = settings.get()[opts.FORCE_FULLSCREEN]
    })
}

const pointerIdler = pointer.idleHide(rootEl, 2000)

const fullscreen = () => {
    let h = parseFloat(getComputedStyle(rootEl, null)
        .height
        .replace('px', '')
    )
    env.display().toggleFullscreen(h !== window.innerHeight, rootEl)
}

const handlePointerMove = (() => {
    const dpi = pointer.scaler()
    let w, h = 0
    let dw = 640, dh = 480
    return (p) => {
        const display = state.current;
        ({w, h} = display.video.size)
        pub(MOUSE_MOVED, display?.hasDisplay ? dpi.scale(p.dx, p.dy, w, h, dw, dh) : p)
    }
})()

const handlePointerDown = (() => {
    const b = {b: null, p: true}
    return (e) => {
        b.b = e.button
        pub(MOUSE_PRESSED, b)
    }
})()

const handlePointerUp = (() => {
    const b = {b: null, p: false}
    return (e) => {
        b.b = e.button
        pub(MOUSE_PRESSED, b)
    }
})()

const trackPointer = (() => {
    let noTrack

    // disable coalesced mouse move events
    const single = true

    // coalesced event are broken since FF 120
    const isFF = env.getBrowser === browser.firefox

    return (enabled) => {
        if (enabled) {
            !noTrack && (noTrack = pointer.track(rootEl, handlePointerMove, isFF || single))
        } else {
            noTrack?.()
            noTrack = null
        }
        rootEl.onpointerdown = enabled ? handlePointerDown : null
        rootEl.onpointerup = enabled ? handlePointerUp : null
    }
})()

const switchKeyboardMouse = async (enabled) => {
    if (!state.current?.hasDisplay) return
    if (!state.kbmSupport) return

    const lockLock = enabled && !state.kbmSkip

    if (lockLock) {
        await rootEl.requestPointerLock(/*{ unadjustedMovement: true}*/)
    }

    trackPointer(lockLock)
    await keyboard.lock(lockLock)
}

rootEl.addEventListener('fullscreenchange', async () => {
    const fullscreen = document.fullscreenElement !== null

    fullscreen && !state.kbmSupport ? pointerIdler.hide() : pointerIdler.show()

    state.current?.onFullscreen?.(fullscreen)
    await switchKeyboardMouse(fullscreen)
    if (state.kbmSupport) {
        // touch.toggle(!fullscreen)
        if (fullscreen) {
            state.kbmSkip ? retropad.poll.enable() : retropad.poll.disable()
        } else {
            retropad.poll.enable()
        }
    }
})

sub(KB_MOUSE_FLAG, () => (state.kbmSupport = true))
sub(KBM_SKIP, (v) => (state.kbmSkip = v) ? retropad.poll.enable() : retropad.poll.disable())

export const screen = {
    fullscreen,
    toggle,
    /**
     * Adds a component. It should have toggle(bool) method and
     * an optional noFullscreen (bool) property.
     */
    add: (...o) => state.components.push(...o),
    init,
}
