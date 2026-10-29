/** Refus d'une action de partie, avec un code que l'interface sait
 *  traduire (cf. src/i18n, `errors`). */
export class RoomError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}
