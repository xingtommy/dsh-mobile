/** CSS Modules class-name map (the mobile package styles its pages with *.module.css). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
