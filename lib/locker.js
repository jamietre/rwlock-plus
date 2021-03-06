var Rwlock = require('rwlock')

/* Wraps rwlock to automatically release locks after some timeout, 
   protecting us from any code failure that might never release a lock */

function Locker(timeout, logger) {
  this.rwlock = new Rwlock()
  this.activeLock = null
  this.count = 0
  this.logger = logger || { warn: function() {} }
  this.timeout = timeout 
}

function errorLockExpired() {
  var message = "Lock '" + this.activeLock.key + "' timed out and was released automatically "
  this.logger.warn(message)
  
  return new Error(message)
}

function tryRelease() {
  if (!this.timeout) return;
  if (Math.abs(Date.now() - this.activeLock.whenObtained) > this.timeout) {
    this.activeLock.release(errorLockExpired.call(this))
  } 
}

function setReleaseTimer() {
  var self = this
  if (!self.timeout) return;
  
  var whenObtained = this.activeLock.whenObtained
  var release = this.activeLock.release

  return setTimeout(function() {
    release(errorLockExpired.call(self))
  }, this.timeout)
}

/*  returns a function which is expected to be invoked by the caller with a release when the lock is obtained.
    wraps that release function to call the original callback as well when the client invokes the release

    When there is no queue, we do nothing -- this optimizes performance for most situations.
    When there is one item in the queue, we check if it's already expired, or set a timer. 
    if there is more than one item in the queue, we do nothing, because a lock for the previous
    item in the queue has not yet been obtained. In these cases, set the timer automatically
    when the lock is obtained.
*/

function getRelease(origCb, cb, key) {
  var self = this
  
  // whenever there is a queue, set a timer to release the prior lock

  self.count++;

  if (this.activeLock) {
    tryRelease.call(self)
  }

  return function(release) {

    var released = false;
    var timer;
    var callbackAndRelease = function() {

      if (released) {
        return;
      }

      // prevent calling release multiple times

      self.count--;
      released = true;
      if (timer) clearTimeout(timer)

      release();

      if (origCb) {
        origCb.apply(null, arguments);
      }
    }

    self.activeLock = {
      key: key,
      release: callbackAndRelease,
      whenObtained: Date.now()
    }

    // the only time we don't set a release for ourselves is when there's nothing else in the queue behind us.
    if (self.count > 1) {
      timer = setReleaseTimer.call(self)
    }
    cb(callbackAndRelease);
  }
}

Locker.prototype.readLock = function(key, origCb, cb) {
  return this.rwlock.readLock(key, getRelease.call(this, origCb, cb, key));
}

Locker.prototype.writeLock = function(key, origCb, cb) {
  return this.rwlock.writeLock(key, getRelease.call(this, origCb, cb, key))
}

module.exports = Locker
