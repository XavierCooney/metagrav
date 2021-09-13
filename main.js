'use strict';

/* ======= Canvas Setup ======= */
/** @type {HTMLCanvasElement} */
const canv = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const ctx = canv.getContext('2d');

const height = 1000;
let actual_height = 600;
let width;


function recalculate_sizing() {
    let actual_width = actual_height * canv.clientWidth / canv.clientHeight;
    canv.width = actual_width;
    canv.height = actual_height;
    width = actual_width * height / actual_height;
    boss_x_screen = width - 150;
}

window.addEventListener('resize', recalculate_sizing);
recalculate_sizing();

/* ======= Utilities ======= */
function lerp(start, end, x) {
    return start + Math.max(0, Math.min(1, x)) * (end - start)
}

function rlerp(start, end) {
    return lerp(start, end, Math.random());
}

function rand_element_form_arr(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function triangle_wave(x) {
    // Period 1
    return 2 * Math.abs(x - Math.floor(x + 0.5));
}

function offset_triangle_wave(x) {
    return triangle_wave(x) - 0.5;
}

const get_time = () => new Date() / 1000;

/* ======= Global Variables ======= */
let elapsed_time = 0;

let player_x = 0;
let cam_x = 0;

let player_y = height / 2;
let grav_direction = 1;
let player_y_velocity = 0;
let forward_velocity = 330;

let last_explosion_time = -Infinity;

let difficulty = 0; // [0, 1]

let player_health = 1; // [0, 1]
let displayed_player_health = 1;
let coins_gotten = 0;
let coins_needed = 0;
let regenerator_repaired = false;

let boss_y = height / 2;
var boss_x_screen;
let boss_last_action = -Infinity;
let boss_phase = 0;


const TOP_BAR = 22;
const SIDE_BARS_WIDTH = 22;

let stage = 0;
let substage = 0;
let stage_elapsed = 0;
let start_of_stage_x = 0;

const player_points = [
    [30, 0],
    [0, -20],
    [-40, -20],
    [-60, -30],
    [-70, -40],
    [-80, -40],
    [-80, -30],
    [-70, -30],
    [-60, -20],
    [-60, 20],
    [-70, 30],
    [-80, 30],
    [-80, 40],
    [-70, 40],
    [-60, 30],
    [-40, 20],
    [0, 20]
];

let exhaust_particles = [];
let last_exhaust_emission = 0;
const time_between_exhausts = 0.2;

let obstacles = [];
let obstacle_generation_x = 600;
let lasers = []; // {x: number, y: number}
let laser_enabled = false;

const dialogue_box_width = 700;
const dialogue_box_margin = 50;
const dialogue_rate = 0.05;

let skip_dialogue_pressed = false;

let graphics_mode = Number(window.localStorage['xav-space-js13k-graphics']); // 0 fancy, 1 normal, 2 basic
if(![0, 1, 2].includes(graphics_mode)) {
    graphics_mode = 1;
}
process_graphics_change();

/* ======= Rendering ======= */
function process_graphics_change() {
    actual_height = [1000, 600, 300][graphics_mode];
    recalculate_sizing();
}

function make_colour_string(r, g, b, a) {
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function get_explosion_offset() {
    return lerp(rlerp(-20, 20), 0, (elapsed_time - last_explosion_time) / 3);
}

let dialogue_lines_done = [];
let characters_to_add_to_line = [];
let dialogue_words_left = [];
let start_of_empty_dialogue = Infinity;
const stages_with_dialogue_screen = [1, 3, 5, 6, 8, 10];
let can_skip_dialogue = true;
let need_space_to_proceed = false;

const HUD_WIDTH = 150;

function dialogue_done_running() {
    return dialogue_lines_done.length && !characters_to_add_to_line.length && !dialogue_words_left.length;
}

function render_stars() {
    for(let i = 0; i < [1200, 750, 200][graphics_mode]; ++i) {
        const offset = i ** 4.7;
        const x = (offset * 1.9 % 500) * width / 500;
        const y = (offset % 501) * height / 501;
        ctx.beginPath();
        const r = offset % 6 * Math.sin(i + elapsed_time * (i % 2 ? 0.9 : 0.8)) ** 2
        ctx.arc(x, y, r / 2 * [0.8, 1, 1.8][graphics_mode], 0, Math.PI * 2);
        const c = 42 * r;
        ctx.fillStyle = make_colour_string(c, c, c, c);
        ctx.fill();
    }
}

function make_font_name(font_size) {
    // return `${Math.round(font_size)}px 'Press Start 2P', monospace`;
    return `${font_size}px 'Press Start 2P', monospace`;
}

function coin_accent_col() {
    if(stage == 4) {
        return '#ff0000';
    } else if(stage == 7) {
        return '#00f02c';
    } else {
        return '#fff700';
    }
}

function coin_fill_col() {
    if(stage == 4) {
        return '#ff7575';
    } else if(stage == 7) {
        return '#97fcd1';
    } else {
        return '#f7c65c';
    }
}

function is_fade_away_stage() {
    return stage == 5 || stage == 6 || stage == 8 || stage == 10;
}
function render_coin(x, y, eaten_t, translation_t) {
    if(is_fade_away_stage()) return; // darn I should've designed this better
    if(eaten_t >= 1) return;
    ctx.save();
    ctx.translate(lerp(x, player_x, translation_t), lerp(y, player_y, translation_t));
    ctx.beginPath();
    ctx.arc(0, 0, lerp(40, 0, eaten_t), 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.fillStyle = coin_fill_col();
    ctx.strokeStyle = coin_accent_col();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for(let i = 5.6; i < 32; i += 7) {
        const offset = (elapsed_time * i) / 10;
        ctx.beginPath();
        ctx.arc(0, 0, lerp(i, 0, eaten_t), offset + Math.PI / 4, offset + 3 * Math.PI / 4, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, lerp(i, 0, eaten_t), offset + 5 * Math.PI / 4, offset + 7 * Math.PI / 4, false);
        ctx.stroke();
    }
    ctx.restore();
}

function render_boss() {
    ctx.save();
    if(stage == 9) {
        if(elapsed_time - boss_last_action < 1) {
            ctx.globalAlpha = lerp(0, 0.15, elapsed_time - boss_last_action);
        } else {
            ctx.globalAlpha = lerp(0.15, 0, (elapsed_time - boss_last_action - 1) / 4);
        }
    } else if(boss_phase == 1) {
        if(elapsed_time - boss_last_action < 1) {
            ctx.globalAlpha = lerp(0, 0.7, elapsed_time - boss_last_action);
        } else {
            ctx.globalAlpha = lerp(0.7, 0, (elapsed_time - boss_last_action - 1) / 5);
        }
    } else {
        ctx.restore();
        return;
    }

    ctx.translate(boss_x_screen, boss_y);
    ctx.beginPath();
    ctx.arc(120 * Math.sqrt(2) + 5, 0, 250, Math.PI * 3 / 4, Math.PI * 5 / 4, true);
    ctx.fillStyle = '#b400eb';
    ctx.fill();
    // ctx.globalCompositeOperation = 'source-in';
    ctx.beginPath();
    ctx.moveTo(0, -180);
    ctx.quadraticCurveTo(-40, 0, 0, 180);

    for(let side = 0; side <= 1; side++) {
        for(let t = side ? 1 : 0; side ? (t > 0) : (t < 1); t += side ? -0.02 : 0.02) {
            const offset_mutliplier = Math.sin(t * Math.PI);
            const offset = 7 * offset_mutliplier * Math.sin(t * 10 + 5 * elapsed_time);
            const x = lerp(0, 90, t);
            const y = lerp(side ? -180 : 180, 0, t);
            ctx.lineTo(
                x + offset, y + offset * 70 / 120
            );
        }
    }

    ctx.closePath();
    ctx.fillStyle = '#FFF';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#DDD';
    ctx.lineWidth = 4;
    ctx.fill();
    // ctx.stroke();
    ctx.clip();

    ctx.fillStyle = '#329ba8';
    ctx.beginPath();
    const eye_up_down = Math.sin(elapsed_time);
    ctx.arc(0, 30 * (eye_up_down > 0 ? 1 : -1) *  Math.pow(Math.abs(eye_up_down), 0.7), 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function render() {
    ctx.save();
    ctx.scale(actual_height / height, actual_height / height);
    // Render stars
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);

    const hud_x = [0, 1].includes(stage) ? 0 : (stage == 2 ? lerp(0, HUD_WIDTH, (stage_elapsed - 0.2) * 4) : HUD_WIDTH);
    ctx.translate(hud_x, 0);

    render_stars();

    // Render terrain (parallaxed)
    for(let i = 0; i < 70; ++i) {
        const radius = 1000;
        ctx.beginPath();
        const t_val = 1 - i / 70;
        const parallax_movement = -1 * cam_x * Math.pow(1.4 * (1 - t_val), 2);
        const x = ((i + 7) ** 5.1 + parallax_movement) % (2 * width) - width / 2;
        const y_offset = lerp(80, 160, (i + 6) ** 5.5 % 1) + t_val * 60;
        ctx.arc(x, height + radius - y_offset, radius, 0, Math.PI * 2);
        const darkness_multiplier = lerp(1, 0.6, t_val);
        ctx.fillStyle = make_colour_string(
            darkness_multiplier * lerp(250, 250, t_val),
            darkness_multiplier * lerp(90, 175, t_val),
            darkness_multiplier * lerp(62, 62, t_val),
            lerp(1, 1, t_val)
        );
        ctx.fill();
    }


    // Render obstacles + render lasers
    ctx.save();
    ctx.translate(-cam_x, 0);
    ctx.save();
    if(is_fade_away_stage()) {
        ctx.globalAlpha = lerp(1, 0, stage_elapsed * 0.8);
    }
    lasers.forEach(laser => {
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        for(let i = 0; i <= laser.w; i += 2) {
            ctx.lineTo(laser.x + i, laser.y + 6 * Math.sin((laser.x + i) / laser.l));
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff26';
        ctx.stroke();
    });
    obstacles.forEach(o => {
        o.r();
    });

    // Render obstacle hitboxes debug bounding
    obstacles.forEach(o => {
        ctx.strokeStyle = '#F00';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y, o.w, o.h);
    });
    ctx.restore();
    ctx.restore();

    // render exhaust
    exhaust_particles.forEach(particle => {
        ctx.beginPath();
        const time_since_particle = elapsed_time - particle.t;
        ctx.arc(particle.x - cam_x, particle.y, lerp(4, 30, time_since_particle / 2), 0,  Math.PI * 2);
        ctx.fillStyle = make_colour_string(210, lerp(50, 120, time_since_particle), 0, 1);
        ctx.fill();
    });

    // Render ship
    if(stage != 0) {
        ctx.save();

        let explosion_t = (Math.sin(elapsed_time * Math.PI * 2 * 5) + 1) / 2 * lerp(1, 0, (elapsed_time - last_explosion_time) / 3);
        ctx.fillStyle = make_colour_string(
            lerp(255, 176, explosion_t),
            lerp(255, 12, explosion_t),
            lerp(255, 12, explosion_t),
            1
        );
        ctx.strokeStyle = make_colour_string(
            lerp(240, 176, explosion_t),
            lerp(240, 12, explosion_t),
            lerp(240, 12, explosion_t),
            1
        );

        ctx.translate(
            player_x - cam_x + get_explosion_offset(),
            player_y + get_explosion_offset()
        );

        ctx.beginPath();
        ctx.moveTo(...player_points[0]);
        player_points.forEach((p, i) => {
            if(i == 0) return;
            ctx.lineTo(...p);
        });
        ctx.closePath();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5;
        ctx.fill();
        ctx.stroke();

        if(laser_enabled) {
            ctx.beginPath();
            ctx.moveTo(30, 0);
            ctx.lineTo(20, 20 / 3);
            ctx.lineTo(20, -20 / 3);
            ctx.closePath();
            ctx.fillStyle = '#00ff26';
            ctx.strokeStyle = '#00ff26';
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = '#3BE';
        ctx.fillRect(-6, -8, 10, 16);
        if(grav_direction == 0) {
            ctx.fillRect(-24, -8, 10, 16);
        } else {
            // Arrow
            ctx.beginPath();
            ctx.moveTo(-19, grav_direction * 8);
            ctx.lineTo(-28, -grav_direction * 8);
            ctx.lineTo(-10, -grav_direction * 8);
            ctx.closePath();
            ctx.fill();
        }
        ctx.fillRect(-42, -8, 10, 16);
        ctx.restore();
    }

    // Render title
    if(stage == 0) {
        ctx.fillStyle = make_colour_string(255, 255, 255, lerp(0, 1, stage_elapsed / 1 - 1));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'hanging';
        ctx.font = make_font_name(68 + 16 * Math.sin(1.3 * elapsed_time - 1.3));
        ctx.fillText("METAGRAV", width / 2, 50);

        const body_offset = lerp(-150, 0, elapsed_time - 2) // 12 * Math.sin(1.3 * elapsed_time);
        ctx.fillStyle = make_colour_string(255, 255, 255, lerp(0, 1, stage_elapsed / 1 - 2));
        ctx.font = make_font_name(40);
        ctx.fillText("Press [SPACE] to Start", width / 2, 300 + body_offset);
        ctx.fillText(`AUDIO ${get_muted() ? 'MUTED' : 'ON'} (switch with [m])`, width / 2, 380 + body_offset);
        ctx.fillText(`GRAPHICS ${['FANCY', 'NORMAL', 'BASIC'][graphics_mode]} (switch with [g])`, width / 2, 460 + body_offset);
        ctx.fillText(`A game by Xavier Cooney for js13k-games`, width / 2, 620 + body_offset); // :]
    }

    // Render HUD
    if(![0, 1].includes(stage) && hud_x > 0) {
        ctx.fillStyle = '#111';
        ctx.fillRect(-hud_x, 0, hud_x, height);
        ctx.strokeStyle = '#EEE';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, height);
        ctx.lineWidth = 10;
        ctx.stroke();

        ctx.fillStyle = '#7d1111';
        ctx.fillRect(-HUD_WIDTH * 2 / 3, 40, HUD_WIDTH / 3, 700);
        const actual_height = 700 * displayed_player_health;
        ctx.fillStyle = '#ff1919';
        ctx.fillRect(-HUD_WIDTH * 2 / 3, 40 + 700 - actual_height, HUD_WIDTH / 3, actual_height);

        if(coins_needed > 0) {
            render_coin(-hud_x / 2, 860, 0, 0);
            ctx.fillStyle = coin_fill_col();
            ctx.font = make_font_name(20);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'hanging';
            ctx.fillText(`${coins_gotten}/${coins_needed}`, -hud_x / 2, 930)
        }
    }

    ctx.translate(-hud_x, 0);

    render_boss();

    // Render dialogue
    if(stages_with_dialogue_screen.includes(stage)) {
        let dialogue_window_x = lerp(width + 10, width - dialogue_box_width - dialogue_box_margin, stage_elapsed + (is_fade_away_stage() ? -2 : 0));
        ctx.fillStyle = '#DDD';
        ctx.fillRect(dialogue_window_x, dialogue_box_margin, dialogue_box_width, height - 2 * dialogue_box_margin);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 10;
        ctx.lineJoin = 'round';
        ctx.strokeRect(dialogue_window_x, dialogue_box_margin, dialogue_box_width, height - 2 * dialogue_box_margin);

        let dialogue_offset = 0;
        dialogue_lines_done.forEach((line, line_num) => {
            ctx.font = "30px 'Press Start 2P', monospace";
            ctx.textAlign = 'left';
            ctx.textBaseline = 'hanging';
            ctx.fillStyle = '#000';
            ctx.fillText(line, dialogue_window_x + 20, dialogue_box_margin + 20 + dialogue_offset);

            const line_measuremnt = ctx.measureText(line + "|");
            dialogue_offset += line_measuremnt.actualBoundingBoxDescent + line_measuremnt.actualBoundingBoxAscent + 9;

            if(line_num == dialogue_lines_done.length - 1 && characters_to_add_to_line.length == 0 && dialogue_words_left.length > 0) {
                const new_line_width = ctx.measureText(line + ' ' + dialogue_words_left[0]).width;
                if(dialogue_words_left[0] == '\n') {
                    dialogue_words_left.shift();
                    dialogue_lines_done.push('');
                } else if(new_line_width < dialogue_box_width - 40) {
                    if(dialogue_words_left[0] != '#') {
                        characters_to_add_to_line = (dialogue_words_left[0] + ' ').split('');
                    } else {
                        characters_to_add_to_line = ['#'];
                    }
                    dialogue_words_left.shift();
                } else {
                    dialogue_lines_done.push('');
                }
            }
        });
        if(dialogue_done_running() && need_space_to_proceed) {
            ctx.font = "italic 20px 'Press Start 2P', monospace";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = '#000';
            ctx.fillText('[SPACE] to continue', dialogue_window_x + dialogue_box_width / 2, height - dialogue_box_margin - 20);
        }
    }

    ctx.restore();
}

/* ======= Audio ======= */
/** @type {AudioContext} */
let audio_ctx;
let master_gain_node;
let dialogue_beep;
let dialogue_beep_gain;

function init_audio() {
    if(!window.AudioContext === undefined) {
        alert("Audio not supported for this browser. Try another browser for best experience");
    }

    audio_ctx = new AudioContext();
    master_gain_node = audio_ctx.createGain();
    master_gain_node.gain.value = window.localStorage['xav-space-js13k-mute'] ? 0 : 0.8;
    master_gain_node.connect(audio_ctx.destination);

    dialogue_beep = audio_ctx.createOscillator();
    dialogue_beep.type = 'triangle';
    dialogue_beep_gain = audio_ctx.createGain();
    dialogue_beep_gain.gain.value = 0;
    dialogue_beep.connect(dialogue_beep_gain).connect(master_gain_node);
    dialogue_beep.start();
    more_music();
}

function set_muted(muted) {
    window.localStorage['xav-space-js13k-mute'] = muted ? "y" : "";
    if(master_gain_node) master_gain_node.gain.value = muted ? 0 : 0.8;
}

function get_muted() {
    return window.localStorage['xav-space-js13k-mute'] == 'y';
}

function do_audio_beep() {
    const dialogue_beep_duration = 0.04;

    dialogue_beep.frequency.cancelScheduledValues(audio_ctx.currentTime);
    dialogue_beep.frequency.setValueAtTime(700, audio_ctx.currentTime);
    dialogue_beep.frequency.linearRampToValueAtTime(100, audio_ctx.currentTime + dialogue_beep_duration);
    dialogue_beep_gain.gain.cancelScheduledValues(audio_ctx.currentTime);
    dialogue_beep_gain.gain.setValueAtTime(0.12, audio_ctx.currentTime);
    dialogue_beep_gain.gain.linearRampToValueAtTime(0, audio_ctx.currentTime + dialogue_beep_duration);
}

function do_coin_collect_beep() {
    const end_time = audio_ctx.currentTime + 0.3;
    const node = audio_ctx.createOscillator();
    node.type = 'square';
    node.frequency.value = 440;
    node.frequency.exponentialRampToValueAtTime(3520, end_time);
    node.start(audio_ctx.currentTime);
    node.stop(end_time);
    const gain_node = audio_ctx.createGain();
    gain_node.gain.setValueAtTime(1, audio_ctx.currentTime);
    gain_node.gain.exponentialRampToValueAtTime(0.01, end_time);
    node.connect(gain_node).connect(master_gain_node);
}

function do_laser_beep() {
    const end_time = audio_ctx.currentTime + 0.3;
    const node = audio_ctx.createOscillator();
    node.type = 'sawtooth';
    node.frequency.value = 880;
    node.frequency.exponentialRampToValueAtTime(110, end_time);
    node.start(audio_ctx.currentTime);
    node.stop(end_time);
    const gain_node = audio_ctx.createGain();
    gain_node.gain.setValueAtTime(0.2, audio_ctx.currentTime);
    gain_node.gain.exponentialRampToValueAtTime(0.01, end_time);
    node.connect(gain_node).connect(master_gain_node);
}

let explosion_buffer = null;

function audio_sound_explosion() {
    const duration = 1.5;
    const buffer_size = audio_ctx.sampleRate * duration;
    if(explosion_buffer === null) {
        const buffer = audio_ctx.createBuffer(1, buffer_size, audio_ctx.sampleRate);

        let data = buffer.getChannelData(0);

        let phase = 0;
        let last_sample = 0;

        for (let i = 0; i < buffer_size; i++) {
            const t = i / audio_ctx.sampleRate;
            const frequency = 1200 * Math.pow(0.5, t);
            phase += frequency / audio_ctx.sampleRate;

            if(phase > 1) {
                phase -= Math.floor(phase);
                last_sample = rlerp(-1, 1);
            }
            data[i] = last_sample;
        }

        explosion_buffer = buffer;
    }

    let noise = audio_ctx.createBufferSource();
    noise.buffer = explosion_buffer;

    let bandpass = audio_ctx.createBiquadFilter();
    bandpass.type = 'lowpass';
    bandpass.frequency.value = 440;

    let gain_node = audio_ctx.createGain();
    gain_node.gain.setValueAtTime(4, audio_ctx.currentTime);
    gain_node.gain.linearRampToValueAtTime(0, audio_ctx.currentTime + duration);

    noise.connect(bandpass).connect(gain_node).connect(master_gain_node);
    noise.start(audio_ctx.currentTime);
}

const base_note = 220;
const music_bpm = 70;
const channel_time_till = [0, 0];

function do_music_for_channel(channel) {
    while(channel_time_till[channel] - audio_ctx.currentTime < 10) {
        // This turned out not to be major pentatonic (missing a third??)
        const notes_to_choose_from = [1, 1.5, 0.75, 1.125, 2 / 3];
        const random_ratio = rand_element_form_arr(notes_to_choose_from);
        const node = audio_ctx.createOscillator();
        node.type = channel ? 'sine' : 'sawtooth';
        node.frequency.value = random_ratio * base_note;
        node.start(channel_time_till[channel]);
        const duration = 60 * rand_element_form_arr([1, 1, 1, 1, 0.5, 2]) / music_bpm;
        node.stop(channel_time_till[channel] + duration + 0.03);
        const gain_node = audio_ctx.createGain();
        gain_node.gain.setValueAtTime(channel ? 0.7 : 0.1, channel_time_till[channel]);
        gain_node.gain.linearRampToValueAtTime(0.03, channel_time_till[channel] + duration);
        node.connect(gain_node).connect(master_gain_node);
        channel_time_till[channel] += duration;
    }
}

function more_music() {
    // Complete prototype at the moment, will change
    do_music_for_channel(0);
    do_music_for_channel(1);

    setTimeout(() => more_music(), 100);
}

/* ======= Updating ======= */
let last_dialogue_character_added = 0;

function cause_explosion() {
    last_explosion_time = elapsed_time;
    audio_sound_explosion();
}

function add_dialogue(dialogue) {
    if(dialogue_lines_done.length == 0) {
        dialogue_lines_done = [''];
    }
    dialogue_words_left.push(...dialogue.split(' '));
}

function dialogue_newline() {
    dialogue_words_left.push('\n');
}

function add_dialogue_nl(dialogue) {
    add_dialogue(dialogue);
    dialogue_newline();
}

function reset_y_pos(dt) {
    player_y -= (player_y - height / 4) / 3 * dt;
    player_y_velocity = 0;
    grav_direction = 0;
}

function deal_damage(damage, reason) {
    if(elapsed_time - last_explosion_time < 2 || is_fade_away_stage()) {
        return;
    }
    if(stage == 2 || stages_with_dialogue_screen.includes(stage)) {
        // you can never die in stage 2 or when there's dialogue on screen
        player_health *= (1 - damage);
        player_health = Math.max(player_health, 0.05);
    } else {
        player_health -= damage;
        player_health = Math.max(0, player_health);

        if(player_health <= 0) {
            player_died();
        }
    }

    cause_explosion();
}

let player_died_from_stage;

function player_died() {
    player_died_from_stage = stage;
    set_stage(5);
}

function make_plasma_obstacle(y_top, h) {
    const x = obstacle_generation_x;
    let last_laser_hit = -1;

    function get_internal_colouring() {
        const colour_offset = 40 * Math.sin(elapsed_time * 3 + x);
        const green_t = (elapsed_time - last_laser_hit) / 3;
        return make_colour_string(
            lerp(89, 210 + colour_offset, green_t),
            lerp(228, 54, green_t),
            lerp(54, 228 + colour_offset, green_t),
            1
        );
    }

    function make_path_and_set_style() {
        const path_2d = new Path2D();

        path_2d.moveTo(x, y_top);
        for(let y_offset = y_top; y_offset <= y_top + h; y_offset += [1, 2, 4][graphics_mode]) {
            let wave_offset = 5 * offset_triangle_wave(y_offset / 100 + elapsed_time)
                            + 1 * offset_triangle_wave(y_offset / 30 - elapsed_time * 3);
            wave_offset *= 6;
            wave_offset *= triangle_wave((y_offset - y_top) / h);
            path_2d.lineTo(x + wave_offset, y_offset);
        }

        ctx.lineWidth = 12 + 4 * Math.cos((player_x - x) / 100);
        ctx.strokeStyle = get_internal_colouring();
        ctx.lineCap = 'round';

        return path_2d;
    }

    return {
        x: x - 100,
        w: 200,
        y: y_top - 100,
        h: h + 200,
        r: () => {
            ctx.beginPath();

            function render_circ(circ_y, r) {
                ctx.beginPath();
                ctx.arc(x, circ_y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = get_internal_colouring();
            let circle_radius = lerp(16, 12, 0.5 + 0.5 * Math.cos((player_x - x) / 100));
            render_circ(y_top, circle_radius);
            render_circ(y_top + h, circle_radius);

            const main_path = make_path_and_set_style();
            ctx.stroke(main_path);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#3d36ff';
            ctx.stroke(main_path);
        },
        i: () => {
            const main_path = make_path_and_set_style();
            for(let i = 0; i < player_points.length; ++i) {
                if(ctx.isPointInStroke(main_path, player_points[i][0] + player_x, player_points[i][1] + player_y)) {
                    deal_damage(1 / 4, 'plasma');
                }
            };
        },
        lh: () => { // laser hit
            last_laser_hit = elapsed_time;
        },
        lhy: y_top,
        lhh: h,
        lhx: x
    };
}

function make_meteorite(x, y) {
    const RADIUS = rlerp(15, 25);

    const final_y = y;
    const final_x = x;
    let speed_y = rlerp(-0.1, 0.5);
    if(Math.random() < 0.6) {
        speed_y = 0;
    }
    speed_y = 0;
    const speed_x = 0 // Math.max(0, rlerp(-0.3, 0.2));

    function offset_function(theta) {
        return 1.3 * (
            Math.sin(5 * theta + elapsed_time * 0.5)
            + Math.sin(6 * theta - elapsed_time * 0.7)
            + 0.5 * Math.sin(11 * theta + elapsed_time * 10)
        );
    }

    function make_path_and_set_style() {
        const path = new Path2D();

        path.moveTo(x + RADIUS + offset_function(0), y);

        for(let theta = 0; theta <= Math.PI * 2; theta += [0.06, 0.08, 0.15][graphics_mode]) {
            path.lineTo(
                x + (RADIUS + offset_function(theta)) * Math.cos(theta),
                y + (RADIUS + offset_function(theta)) * Math.sin(theta)
            );
        }
        path.closePath();

        ctx.lineWidth = 4;
        return path;
    }

    obstacles.push({
        x: x - 20,
        y: y - 20,
        w: 40,
        h: 40,
        r: () => {
            ctx.strokeStyle = '#3d130a';
            const path = make_path_and_set_style();
            let gradient = ctx.createRadialGradient(x, y, 0, x , y, RADIUS);
            gradient.addColorStop(0, '#66291c');
            gradient.addColorStop(1, '#964230');
            ctx.fillStyle = gradient;
            ctx.fill(path);
            ctx.stroke(path);
        },
        i: () => {
            // TODO: combine this behaviour with the plasma field and and more points to the player ship
            const main_path = make_path_and_set_style();
            for(let i = 0; i < player_points.length; ++i) {
                // if(ctx.isPointInStroke(main_path, player_points[i][0] + player_x, player_points[i][1] + player_y)) {
                //     return true;
                // }
                if(ctx.isPointInPath(main_path,  player_points[i][0] + player_x, player_points[i][1] + player_y)) {
                    deal_damage(1 / 9, 'meteor');
                }
            };
        },
        u: () => {
            y = final_y + (player_x - final_x) * speed_y;
            x = final_x + (player_x - final_x) * speed_x;
        }
    })
}

function make_coin(x, y) {
    if(Math.random() > 0.6) {
        // There's no guarentees in life
        return;
    }
    if(stage == 2) return;

    let time_eaten = Infinity;
    let has_been_eaten = false;

    obstacles.push({
        x: x - 40,
        w: 80,
        y: y - 40,
        h: 80,
        r: () => {
            const eaten_t = lerp((Math.sin(elapsed_time * 3) + 1) / 10, 1, (elapsed_time - time_eaten) / 0.4);
            const translation_t = (elapsed_time - time_eaten) / 0.42;

            render_coin(x, y, eaten_t, translation_t);
        },
        i: () => {
            time_eaten = Math.min(time_eaten, elapsed_time);
            if(!has_been_eaten) {
                has_been_eaten = true;
                coin_collected();
            }
        }
    });
}

function generate_obstacle() {
    const decision_main = Math.random();
    const start_of_obstacle_x = obstacle_generation_x;

    if(decision_main < 0.1) {
        // centre plasma obstacle (separator)
        obstacles.push(make_plasma_obstacle(rlerp(0, 450), rlerp(250, 350)));
        obstacle_generation_x += 700;
    } else if(decision_main < 0.5) {
        // plasma field
        const end_of_obstacle_x = start_of_obstacle_x + (stage == 2 ? 1000 : rlerp(1800, 3200));
        while(obstacle_generation_x <= end_of_obstacle_x) {
            // 'Pillars of doom'
            const sub_decision = Math.random();
            if(sub_decision < 0.2) {
                // Middle
                obstacles.push(make_plasma_obstacle(250, 400));
                make_coin(obstacle_generation_x + 300, 450)
                obstacle_generation_x += rlerp(650, 800);
            } else if(sub_decision < 0.4) {
                // Vertical
                obstacles.push(make_plasma_obstacle(-100, 650));
                make_coin(obstacle_generation_x + 300, 300)
                obstacle_generation_x += rlerp(700, 800);
            } else if(sub_decision < 0.6) {
                obstacles.push(make_plasma_obstacle(250, 1750));
                make_coin(obstacle_generation_x + 300, 600)
                obstacle_generation_x += rlerp(700, 800);
            }
        }
    } else if(decision_main < 0.9 && stage != 2) {
        // Asteroid/meteorite field
        const target_num_metoerites = 60;
        obstacle_generation_x += 50;
        for(let num_done = 0; num_done < target_num_metoerites; ++num_done) {
            const half_height_range = lerp(125, 420, num_done / 20);
            let new_y = rlerp(0, half_height_range);
            if(Math.random() > 0.5) {
                new_y = 840 - new_y;
            }
            if(new_y > 100 && new_y < 740 && Math.random() > 0.85) {
                obstacle_generation_x += 80;
                make_coin(obstacle_generation_x, new_y);
                obstacle_generation_x += 120;
            } else {
                obstacle_generation_x += 80;
                make_meteorite(obstacle_generation_x, new_y);
            }
        }
        obstacle_generation_x += 300;
    }
}

function do_two_boxes_collide(b1, b2) {
    return b1.x < b2.x + b2.w && b1.x + b1.w > b2.x && b1.y < b2.y + b2.h && b1.y + b1.h > b2.y;
}

function norm_dialogue_next() {
    substage += 1;
    dialogue_lines_done = [];
    can_skip_dialogue = true;
    need_space_to_proceed = true;
}

function coin_collected() {
    if(!stages_with_dialogue_screen.includes(stage) && !is_fade_away_stage()) {
        coins_gotten += 1;
        do_coin_collect_beep();

        if(coins_gotten == coins_needed) {
            if(stage == 4) {
                set_stage(6);
            } else if(stage == 7) {
                set_stage(8);
            } else if(stage == 9) {
                set_stage(10);
            }
        } else if(stage == 9) {
            if([5, 10, 15, 20].includes(coins_gotten)) {
                boss_last_action = elapsed_time;
            }
        }
    }
}

function update(dt) {
    elapsed_time += dt;
    stage_elapsed += dt;

    if(stage == 0) return;

    if(elapsed_time - last_exhaust_emission > time_between_exhausts) {
        [-35, 35].forEach(dy => {
            exhaust_particles.push({
                x: player_x - 80 + get_explosion_offset(),
                y: player_y + dy + get_explosion_offset(),
                dx: -5,
                dy: player_y_velocity / 3,
                t: elapsed_time
            });
        });
        last_exhaust_emission = elapsed_time;
    }

    exhaust_particles.forEach(particle => {
        particle.x += particle.dx * dt;
    });

    if(exhaust_particles.length && exhaust_particles[0].x + 200 < cam_x) {
        exhaust_particles.shift();
    }

    player_x += forward_velocity * dt;
    cam_x = Math.max(600, player_x) - 600;

    player_y_velocity += grav_direction * dt * 1000;
    player_y += player_y_velocity * dt;

    if(player_y < 60) {
        player_y = 60;
        player_y_velocity = 0;
    } else if(player_y < 120) {
        // player_y_velocity += dt * 20000 / Math.pow(player_y - 59, 2);
        if(player_y_velocity < 0) {
            player_y_velocity += -15 * dt * player_y_velocity;
        }
    }

    if(player_y > 850) {
        player_y -= 50;
        player_y_velocity = 0;
        deal_damage(1 / 5, 'floor');
        grav_direction = -1;
    }

    let player_box = {
        x: player_x - 100,
        y: player_y - 40,
        w: 150,
        h: 80
    }

    obstacles.forEach(o => {
        if(o.u) {
            o.u(dt);
        }
        if(do_two_boxes_collide(o, player_box) && o.i()) {
            // wat
        }
    });

    lasers.forEach(l => {
        l.u(l, dt);
    });

    while(lasers.length) {
        if(lasers[0].x - cam_x > width + 20) {
            lasers.shift();
        } else {
            break;
        }
    }

    while(obstacles.length && obstacles[0].x + obstacles[0].w < cam_x) {
        obstacles.shift();
    }

    if(stage != 0) {
        while(obstacle_generation_x < cam_x + width + 100) {
            if(stages_with_dialogue_screen.includes(stage) || (stage == 2 && substage == 1)) {
                obstacle_generation_x += 100;
            } else {
                generate_obstacle();
            }
        }
    }

    if(displayed_player_health > player_health) {
        displayed_player_health -= Math.min(dt * 0.5, displayed_player_health - player_health);
    } else if(displayed_player_health < player_health) {
        displayed_player_health += Math.min(dt / 2, player_health - displayed_player_health);
    }

    if(regenerator_repaired && stage != 5) {
        player_health += dt / 120;
        player_health = Math.min(player_health, 1);
    }

    if(characters_to_add_to_line.length && (stage != 5 || stage_elapsed > 2)) {
        if(characters_to_add_to_line[0] == '#') {
            if(skip_dialogue_pressed || elapsed_time - last_dialogue_character_added > 0.5) {
                characters_to_add_to_line.shift();
                if(!skip_dialogue_pressed) last_dialogue_character_added += 0.5;
            }
        } else if(skip_dialogue_pressed || elapsed_time - last_dialogue_character_added > dialogue_rate) {
            last_dialogue_character_added = Math.max(last_dialogue_character_added, elapsed_time - 3 * dialogue_rate);
            do_audio_beep();
            if(!skip_dialogue_pressed) last_dialogue_character_added += dialogue_rate;
            dialogue_lines_done[dialogue_lines_done.length - 1] += characters_to_add_to_line[0];
            characters_to_add_to_line.shift();
        }
    }

    if(characters_to_add_to_line.length == 0 && dialogue_words_left.length == 0 && !need_space_to_proceed) {
        start_of_empty_dialogue = Math.min(start_of_empty_dialogue, elapsed_time);
        skip_dialogue_pressed = false;
    } else {
        start_of_empty_dialogue = Infinity;
    }

    // EXPOSITION/DIALOGUE
    if(stage == 1) {
        reset_y_pos(dt);
        player_y = height / 4;
        if(substage == 0 && stage_elapsed > 1) {
            add_dialogue_nl('[HYPERSPACE ANOMALY DETECTED] \n');
            add_dialogue_nl('# [STARTING SHIP AI] \n');
            add_dialogue_nl('# # # Hello there, # I am OSCAR, your Onboard Ship Computational Analysis Reporter. Please standby... \n');
            // console.log(Array.from(dialogue_words_left));
            substage = 1;
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 2) {
            player_x = -300;
            add_dialogue_nl('ALERT! Exiting hyperspeed!');
            can_skip_dialogue = false;
            need_space_to_proceed = true;
            substage = 2;
        } else if(substage == 2 && elapsed_time - start_of_empty_dialogue > 0.3) {
            norm_dialogue_next();
            add_dialogue_nl("I have detected some good news and some bad news. # The bad news is that the ship has exited hyperspace onto a planet 200 parsecs away from the target desination. # The good news is that all the ship's systems are intact...");
        } else if(substage == 3 && elapsed_time - start_of_empty_dialogue > 0.1) {
            cause_explosion();
            norm_dialogue_next();
            add_dialogue_nl("# # # # Update: I was wrong. It's all bad news actually. # Almost every control is scrambled. In fact, the only thing that's working seems to be the internal gravitational actuator. # I've wired up the [SPACE] button on your control matrix to it. The orbital navigation system should keep you from flying up to outer space, but uhhhh still... # be careful.");
        } else if(substage == 4 && elapsed_time - start_of_empty_dialogue > 0.3) {
            obstacle_generation_x += 900;
            obstacles.push(make_plasma_obstacle(-20, 500));
            obstacle_generation_x += 500;
            set_stage(2);
        }
    } else if(stage == 3) {
        reset_y_pos(dt);

        if(substage == 0) {
            norm_dialogue_next();
            add_dialogue("Hi. OSCAR here again. I realised I should've probably warned you about the plasma arcs usually found in this planetary system, ");
            if(player_health < 1) {
                // Coild've just hit the ground, not the plasma. But the advice still stands
                add_dialogue("sorry. Regardless, as a rule of thumb, I advise tring not to hit big scary looking stuff. # # Or small scary looking stuff.");
            } else {
                add_dialogue("but it looks like you've already got that handled. Good job.");
            }
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 0.1) {
            norm_dialogue_next();
            add_dialogue("To get out of here, you'll need to collect some materials. # Try to pick up any red coloured part bundles you find, # and if you get enough I might be able to fix the ship's hull regeneration system.");
            if(player_health < 1) {
                add_dialogue("And try not to hit anything else.");
            }
        } else if(substage == 2 && elapsed_time - start_of_empty_dialogue > 0.1) {
            set_stage(4);
        }
    } else if(stage == 5) {
        reset_y_pos(dt);

        if(substage == 0 && stage_elapsed > 2) {
            player_health = 1;
            norm_dialogue_next();
            add_dialogue("Well it looks like the hull's been severly damaged. Luckily I phase shifted the ship into a different timeline right before the engine exploded.");
            if(coins_gotten == 0) {
                add_dialogue("At least you didn't lose any of the parts you were gathering.");
            } else {
                add_dialogue(`Alas, you lost ${coins_gotten} part${coins_gotten == 1 ? '' : 's'} you were gathering.`);
            }
            coins_gotten = 0;
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 0.1) {
            obstacles = [];
            set_stage(player_died_from_stage);
        }
    } else if(stage == 6) {
        reset_y_pos(dt);

        if(substage == 0 && stage_elapsed > 1.5) {
            coins_gotten = 0;
            norm_dialogue_next();
            add_dialogue("Great work! Now I should be able to to repair the hull regenerator...");
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 0.1) {
            norm_dialogue_next();
            regenerator_repaired = true;
            add_dialogue("Done! This should help with those meteorites that I probably should've warned you about. Next thing to fix is the ship's LASER, for that you'll need to collect green part bundles.");
        } else if(substage == 2 && elapsed_time - start_of_empty_dialogue > 0.1) {
            obstacles = [];
            set_stage(7);
        }
        reset_y_pos(dt);
    } else if(stage == 8) {
        reset_y_pos(dt);

        if(substage == 0 && stage_elapsed > 1.5) {
            coins_gotten = 0;
            norm_dialogue_next();
            add_dialogue_nl("Brilliant! LASER time!! \n \n # # Ummm, sorry, but I slightly exaggerated the need to repair the LASER. It isn't going to be particularly useful, but LASERs are so fun! # # Pew # pew # pew # pew! # # Anyway...");
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 0.1) {
            norm_dialogue_next();
            laser_enabled = true;
            add_dialogue_nl("I've wired up the LASER activation control to the same [SPACE] button on your key matrix to keep things simple. But really, it won't be of much use. The last parts to collect are the golden hyperdrive bundles, and then we should be able to jump out of here.");
        } else if(substage == 2 && elapsed_time - start_of_empty_dialogue > 0.1) {
            obstacles = [];
            set_stage(9);
        }
    } else if(stage == 10) {
        reset_y_pos(dt);

        if(substage == 0 && stage_elapsed > 1.9) {
            coins_gotten = 0;
            norm_dialogue_next();
            add_dialogue_nl("Great job! # Now all I have to do is enable the hyperdri-");
        } else if(substage == 1 && elapsed_time - start_of_empty_dialogue > 0.1) {
            obstacles = [];
            boss_last_action = elapsed_time;
            boss_phase = 1;
            substage = 2;
        } else if(substage == 2 && boss_phase == 2) {
            norm_dialogue_next();
            add_dialogue_nl("What's that!? It just shot at us! If it hits the ship as we go into hyperspeed, we'll definitely explode. Before we leave this planet, you'll need to make sure that thing is dead.");
        }
    } else if(stage > 0) {
        if(grav_direction == 0) grav_direction = 1;
    }

    // PLAY STAGES
    if(stage == 2) {
        if(substage == 0 && player_x > start_of_stage_x + 2000) {
            substage = 1;
        } else if(substage == 1 && obstacles.length === 0) {
            set_stage(3);
        }
    }

    // Handle boss
    if(boss_phase == 1) {
        // Frighten player
        boss_y = lerp(2 * height / 3, -300, (elapsed_time - boss_last_action) / 6);
    }
}

function do_grav_switch() {
    grav_direction *= -1;
    player_y_velocity /= 4;
}

/* ======= Game Loop ======= */
function set_stage(new_stage) {
    if(stage == 0) {
        player_x = -1e20;
        exhaust_particles = [];
        init_audio();
    }

    if(new_stage == 4) {
        coins_needed = 10;
    } else if(new_stage == 7) {
        coins_needed = 20;
        regenerator_repaired = true;
    } else if(new_stage == 9) {
        coins_needed = 25;
        laser_enabled = true;
    }  else {
        coins_needed = 0;
    }

    stage = new_stage;
    substage = 0;
    stage_elapsed = 0;
    start_of_stage_x = obstacle_generation_x;
}

let last_frame_time = get_time();

function frame() {
    const this_frame_time = get_time();
    let dt = Math.max(Math.min(this_frame_time - last_frame_time, 1 / 15), 0);
    window.dt_percent = dt / (1 / 15);
    last_frame_time = this_frame_time;

    // dt *= 1.5;
    const SUBSTEPS = 1 + Math.ceil(dt / 0.03);
    // console.log(dt / SUBSTEPS);
    for(let substep = 0; substep < SUBSTEPS; ++substep) {
        update(dt / SUBSTEPS);
    }

    render();
    requestAnimationFrame(frame);
}

frame();

function shoot_laser() {
    // if(lasers.length && player_x + 80 >= lasers[lasers.length - 1].x) return;
    let collision_x = null;

    lasers.push({
        x: player_x,
        y: player_y,
        w: 80,
        l: 5,
        u: (l, dt) => {
            if(collision_x !== null) {
                l.x += dt * 700;
                l.w -= dt * 900;
            } else {
                l.x += dt * 700;
                l.w += dt * 100;
            }

            obstacles.forEach(plasma => {
                if(!plasma.lh) return;
                if(l.x < plasma.lhx && plasma.lhx < l.x + l.w && plasma.lhy < l.y && l.y < plasma.lhy + plasma.lhh) {
                    plasma.lh();
                    collision_x = true;
                }
            });
        }
    });
    do_laser_beep();
}

function space_key_hit() {
    if(stages_with_dialogue_screen.includes(stage)) {
        if(dialogue_done_running()) {
            if(need_space_to_proceed) {
                need_space_to_proceed = false;
            }
        } else if(can_skip_dialogue && (stage == 1 || stage_elapsed > 0.3)) {
            skip_dialogue_pressed = true;
        }
    } else if(stage == 0) {
        set_stage(1);
    } else {
        do_grav_switch();
        if(laser_enabled) {
            shoot_laser();
        }
    }
}

let last_non_reversed_keydown = -1;

window.addEventListener('keydown', e => {
    if(e.code == 'Space') {
        if(last_non_reversed_keydown < 0) {
            last_non_reversed_keydown = elapsed_time;
            space_key_hit();
        }
    } else if(e.code == 'KeyQ') {
        set_stage(9); // TODO: Remove
        player_x = 0;
    } else if(e.code == 'KeyM') {
        set_muted(!get_muted());
    } else if(e.code == 'KeyG') {
        graphics_mode += 1;
        graphics_mode %= 3;
        window.localStorage['xav-space-js13k-graphics'] = graphics_mode;
        process_graphics_change();
    }
});

window.addEventListener('keyup', e => {
    if(e.code == 'Space') {
        last_non_reversed_keydown = -1;
    }
});