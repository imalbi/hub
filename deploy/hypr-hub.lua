hl.bind("SUPER + H", hl.dsp.exec_cmd("caelestia toggle hub"))

hl.window_rule({
    match = {
        class = "^chrome-127\\.0\\.0\\.1__desk-.*$",
        initial_title = "^127\\.0\\.0\\.1_/desk$",
    },
    workspace = "special:hub silent",
})
