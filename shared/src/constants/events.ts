export const SOCKET_EVENTS = {
  HUB_LIST_GAMES: 'hub:list_games',
  HUB_CREATE_ROOM: 'hub:create_room',
  HUB_JOIN_ROOM: 'hub:join_room',
  HUB_ADD_BOT: 'hub:add_bot',
  HUB_LEAVE_ROOM: 'hub:leave_room',
  ROOM_UPDATED: 'room:updated',
  GAME_START: 'game:start',
  GAME_PAUSE_TOGGLE: 'game:pause_toggle',
  GAME_INPUT: 'game:input',
  GAME_STATE_TICK: 'game:state_tick',
  GAME_REMATCH: 'game:rematch',
  ERROR_MESSAGE: 'system:error'
} as const;
