/**
 * Nothing, which is what the slot holds on every route that is not an
 * intercepted card. A parallel route without a default renders the router's
 * 404 for the slot on a hard navigation, so this file is not optional.
 */
export default function ModalDefault() {
  return null;
}
