- The shared passcode (`CARDS_TOKEN`, the `x-cards-key` header) is gone. Every caller is an
  account now: a Supabase access token as bearer, or the session cookie on this origin. No
  client of ours sent it any more; a request that still does is refused like any other
  unsigned request.
